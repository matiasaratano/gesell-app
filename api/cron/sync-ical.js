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
    global: { headers: { 'x-app-source': 'ical' } },
    auth: { persistSession: false },
  })
}

import { parseIcs, upsertIcalReservas as upsertReservas, reconciliarCierres } from '../../src/lib/ical-sync.js'

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
      const reabiertas = await reconciliarCierres(supabase, eventos, feed.propiedadId, feed.canal)
      const stats = await upsertReservas(supabase, eventos, feed.propiedadId, feed.canal)
      resultados.push({ propiedadId: feed.propiedadId, canal: feed.canal, ...stats, reabiertas })
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
