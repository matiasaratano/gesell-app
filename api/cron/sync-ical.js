import { createClient } from '@supabase/supabase-js'
import { isAllowedIcalUrl, fetchIcalUpstream } from '../lib/ical-upstream.js'

/**
 * Vercel Cron: GET /api/cron/sync-ical
 * Corre automáticamente cada hora según vercel.json.
 * También puede invocarse manualmente con el header correcto.
 *
 * Variables de entorno requeridas (server-side, NO el VITE_ prefix):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   ← service role para bypassear RLS
 *   CRON_SECRET                 ← string random para autenticar llamadas manuales
 */

// ── Cliente Supabase con service role (solo servidor) ──────────────────────────
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, {
    auth: { persistSession: false },
  })
}

// ── Parser iCal (igual que el frontend en Calendario.jsx) ─────────────────────
function parseIcs(text) {
  const events = []
  const lines = text.split(/\r?\n/)
  let inEvent = false
  let event = {}

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      inEvent = true
      event = {}
    } else if (line.startsWith('END:VEVENT')) {
      inEvent = false
      events.push(event)
    } else if (inEvent) {
      if (line.startsWith('DTSTART;'))      event.start   = line.replace('DTSTART;', '').split(':')[1]
      else if (line.startsWith('DTSTART:')) event.start   = line.replace('DTSTART:', '')
      else if (line.startsWith('DTEND;'))   event.end     = line.replace('DTEND;', '').split(':')[1]
      else if (line.startsWith('DTEND:'))   event.end     = line.replace('DTEND:', '')
      else if (line.startsWith('SUMMARY:')) event.summary = line.replace('SUMMARY:', '')
    }
  }

  const formatDate = (d) => {
    if (!d) return ''
    return d.replace(/=$/, '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3').slice(0, 10)
  }

  return events
    .map((e) => ({
      start:   formatDate(e.start),
      end:     formatDate(e.end),
      summary: e.summary || '',
    }))
    .filter((e) => e.start && e.end)
}

// ── Upsert (lógica idéntica a upsertIcalReservas en Calendario.jsx) ───────────
async function upsertReservas(supabase, eventos, propiedadId, canal) {
  const stats = { total: eventos.length, inserted: 0, updated: 0, deduped: 0, conflicts: 0 }

  for (const ev of eventos) {
    const checkin  = ev.start
    const checkout = ev.end
    if (!checkin || !checkout) continue

    const esCerrada = ev.summary.toUpperCase().includes('CLOSED')
    const payload = {
      propiedad_id: propiedadId,
      checkin,
      checkout,
      canal_origen: canal,
      estado: esCerrada ? 'confirmada' : 'pendiente',
    }

    const { data: overlaps, error } = await supabase
      .from('reservas')
      .select('id, checkin, checkout, estado')
      .eq('propiedad_id', propiedadId)
      .lt('checkin', checkout)
      .gt('checkout', checkin)
      .neq('estado', 'cancelada')

    if (error) throw error

    const exactMatches = (overlaps ?? []).filter(
      (r) => r.checkin === checkin && r.checkout === checkout && r.estado === payload.estado
    )

    // Eliminar duplicados exactos (si hay más de uno)
    if (exactMatches.length > 1) {
      const duplicateIds = exactMatches.slice(1).map((r) => r.id)
      await supabase.from('reservas').delete().in('id', duplicateIds)
      stats.deduped += duplicateIds.length
    }

    const exactMatch = exactMatches[0]
    if (exactMatch?.id) {
      await supabase.from('reservas').update(payload).eq('id', exactMatch.id)
      stats.updated += 1
      continue
    }

    if ((overlaps ?? []).length > 0) {
      stats.conflicts += 1
      continue
    }

    await supabase.from('reservas').insert(payload)
    stats.inserted += 1
  }

  return stats
}

// ── Handler principal ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Solo GET (Vercel Cron siempre usa GET)
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Seguridad: Vercel inyecta automáticamente el Bearer cuando es Cron.
  // Para llamadas manuales, debés pasar: Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers['authorization']
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  let supabase
  try {
    supabase = getSupabaseAdmin()
  } catch (e) {
    console.error('[cron/sync-ical] Config error:', e.message)
    return res.status(500).json({ error: e.message })
  }

  // 1. Leer links iCal de todas las propiedades
  const { data: propiedades, error: propError } = await supabase
    .from('propiedades')
    .select('id, link_ical_booking, link_ical_airbnb')

  if (propError) {
    console.error('[cron/sync-ical] Error leyendo propiedades:', propError.message)
    return res.status(500).json({ error: propError.message })
  }

  // Armar lista de feeds a procesar
  const feeds = []
  for (const p of propiedades ?? []) {
    if (p.link_ical_booking && isAllowedIcalUrl(p.link_ical_booking)) {
      feeds.push({ url: p.link_ical_booking, propiedadId: p.id, canal: 'booking' })
    }
    if (p.link_ical_airbnb && isAllowedIcalUrl(p.link_ical_airbnb)) {
      feeds.push({ url: p.link_ical_airbnb, propiedadId: p.id, canal: 'airbnb' })
    }
  }

  if (!feeds.length) {
    console.log('[cron/sync-ical] No hay feeds configurados.')
    return res.status(200).json({ ok: true, mensaje: 'Sin feeds configurados', resultados: [] })
  }

  // 2. Sync cada feed
  const resultados = []
  for (const feed of feeds) {
    try {
      const text = await fetchIcalUpstream(feed.url)
      const eventos = parseIcs(text)
      const stats = await upsertReservas(supabase, eventos, feed.propiedadId, feed.canal)
      resultados.push({ propiedadId: feed.propiedadId, canal: feed.canal, ...stats })
      console.log(`[cron/sync-ical] ${feed.canal} propiedad=${feed.propiedadId}`, stats)
    } catch (e) {
      const resultado = { propiedadId: feed.propiedadId, canal: feed.canal, error: e.message }
      resultados.push(resultado)
      console.error(`[cron/sync-ical] Error en ${feed.canal} propiedad=${feed.propiedadId}:`, e.message)
    }
  }

  // 3. Registrar en tabla de logs (opcional — no falla si la tabla no existe)
  try {
    await supabase.from('ical_sync_log').insert({
      ejecutado_at: new Date().toISOString(),
      resultados: JSON.stringify(resultados),
    })
  } catch {
    // silencioso si la tabla no existe todavía
  }

  return res.status(200).json({ ok: true, ejecutado_at: new Date().toISOString(), resultados })
}
