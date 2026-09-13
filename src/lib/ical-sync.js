export function parseIcs(text) {
  if (!/^BEGIN:VCALENDAR\s*$/m.test(text) || !/^END:VCALENDAR\s*$/m.test(text)) throw new Error('El archivo iCal no es un calendario completo. No se modificaron sus cierres.')
  if ((text.match(/^BEGIN:VEVENT\s*$/gm) || []).length !== (text.match(/^END:VEVENT\s*$/gm) || []).length) throw new Error('El calendario iCal está incompleto.')
  const unfoldedText = text.replace(/\r?\n[ \t]/g, '')
  const events = []
  const lines = unfoldedText.split(/\r?\n/)
  let inEvent = false
  let event = {}
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) { inEvent = true; event = {} }
    else if (line.startsWith('END:VEVENT')) { inEvent = false; events.push(event) }
    else if (inEvent) {
      const colonIdx = line.indexOf(':')
      if (colonIdx !== -1) {
        const key = line.substring(0, colonIdx).toUpperCase()
        const val = line.substring(colonIdx + 1).trim()
        if (key.startsWith('DTSTART')) event.start = val
        else if (key.startsWith('DTEND')) event.end = val
        else if (key.startsWith('SUMMARY')) event.summary = val
        else if (key.startsWith('DESCRIPTION')) event.description = val
        else if (key === 'STATUS') event.status = val
        else if (key === 'RRULE') throw new Error('El calendario contiene recurrencias no compatibles. No se modificaron sus cierres.')
      }
    }
  }
  return events.filter(e => e.status !== 'CANCELLED').map(e => {
    const formatDate = (d) => {
      if (!d) return ''
      return d.replace(/=$/, '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3').slice(0, 10)
    }
    const parsed = {
      start: formatDate(e.start),
      end: formatDate(e.end),
      summary: e.summary || '',
      description: e.description || '',
    }
    const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d
    if (!validDate(parsed.start) || !validDate(parsed.end) || parsed.end <= parsed.start) throw new Error('El calendario contiene fechas inválidas. No se modificaron sus cierres.')
    return parsed
  })
}

export function protegida(row, canal) {
  return row.canal_origen !== canal || !!row.cliente_id || Number(row.precio_total) > 0 ||
    (row.pagos || []).some(p => Number(p.monto) > 0) || !['cerrada', 'pendiente'].includes(row.estado)
}

export function coberturaCierre(row, eventos) {
  const tramos = eventos.map(e => ({ start: e.start > row.checkin ? e.start : row.checkin, end: e.end < row.checkout ? e.end : row.checkout }))
    .filter(e => e.start < e.end).sort((a, b) => a.start.localeCompare(b.start))
  const unidos = []
  for (const tramo of tramos) {
    const ultimo = unidos.at(-1)
    if (ultimo && tramo.start <= ultimo.end) ultimo.end = tramo.end > ultimo.end ? tramo.end : ultimo.end
    else unidos.push({ ...tramo })
  }
  return unidos
}

// Only reconcile unprocessed channel closures after every feed for the property was validated.
export async function reconciliarCierres(supabase, eventos, propiedadId, canal) {
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('reservas')
      .select('id, checkin, checkout, estado, canal_origen, cliente_id, precio_total, notas_internas, pagos(monto)')
      .eq('propiedad_id', propiedadId).eq('canal_origen', canal).eq('estado', 'cerrada')
      .gt('checkout', hoy).order('id').range(offset, offset + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) break
  }
  let reabiertas = 0
  for (const row of rows) {
    if (protegida(row, canal)) continue
    const cobertura = coberturaCierre(row, eventos)
    if (cobertura.length === 1 && cobertura[0].start === row.checkin && cobertura[0].end === row.checkout) continue
    const query = supabase.from('reservas')
    const mutation = cobertura.length
      ? query.update({ checkin: cobertura[0].start, checkout: cobertura[0].end })
      : query.delete()
    const { data, error } = await mutation.eq('id', row.id).eq('canal_origen', canal).eq('estado', 'cerrada')
      .is('cliente_id', null).eq('checkin', row.checkin).eq('checkout', row.checkout).select('id')
    if (error) throw error
    if (!data?.length) throw new Error('Un cierre cambió durante la sincronización. Volvé a sincronizar.')
    for (const tramo of cobertura.slice(1)) {
      const { error: insertError } = await supabase.from('reservas').insert({
        propiedad_id: propiedadId, canal_origen: canal, estado: 'cerrada',
        checkin: tramo.start, checkout: tramo.end, notas_internas: row.notas_internas,
      })
      if (insertError) throw insertError
    }
    reabiertas += 1
  }
  return reabiertas
}

export async function upsertIcalReservas(supabase, eventos, propiedadId, canal) {
  const stats = {
    total: eventos.length,
    inserted: 0,
    updated: 0,
    deduped: 0,
    skipped: 0,
    insertedReservas: 0,   // pendiente (reservas reales de huéspedes)
    insertedBloqueadas: 0, // cerrada (fechas bloqueadas por la plataforma)
    conflicts: [],
    nuevas: [],            // lista de eventos nuevos para el reporte
  }

  for (const ev of eventos) {
    let checkin = ev.start?.slice(0, 10)
    let checkout = ev.end?.slice(0, 10)
    if (!checkin || !checkout) continue
    checkin = checkin.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
    checkout = checkout.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')

    const summaryRaw = (ev.summary || '').trim()
    const summaryUpper = summaryRaw.toUpperCase()
    const noches = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000)

    // Palabras clave de cierres y bloqueos de anfitrión/plataforma en iCal
    const keywordsCierre = ['CLOSED', 'NOT AVAILABLE', 'NO DISPONIBLE', 'BLOQUEADO', 'BLOCKED', 'CIERRE', 'UNAVAILABLE']
    const esCierreOBloqueo = keywordsCierre.some(kw => summaryUpper.includes(kw))

    // Si tiene palabra clave de cierre o dura 25+ noches, se trata como 'cerrada'
    const esCerrada = esCierreOBloqueo || noches >= 25
    const estadoNuevo = esCerrada ? 'cerrada' : 'pendiente'

    const payload = {
      propiedad_id: propiedadId,
      checkin,
      checkout,
      canal_origen: canal,
      estado: estadoNuevo,
      // Guardar el summary original del iCal en notas_internas para trazabilidad
      notas_internas: summaryRaw || null,
    }

    const { data: overlaps, error } = await supabase
      .from('reservas')
      .select('id, checkin, checkout, estado, canal_origen, cliente_id, precio_total, pagos(monto)')
      .eq('propiedad_id', propiedadId)
      .lt('checkin', checkout)
      .gt('checkout', checkin)
      .neq('estado', 'cancelada')

    if (error) throw error

    if ((overlaps || []).some(row => row.canal_origen === canal && row.checkin === checkin && row.checkout === checkout && protegida(row, canal))) {
      stats.skipped += 1
      continue
    }

    // Buscar coincidencia exacta (mismas fechas Y mismo estado)
    const exactMatches = (overlaps ?? []).filter(
      (row) => row.checkin === checkin && row.checkout === checkout && row.estado === estadoNuevo && !protegida(row, canal)
    )

    // Eliminar duplicados exactos si hay más de uno
    if (exactMatches.length > 1) {
      const duplicateIds = exactMatches.slice(1).map((row) => row.id)
      const { error: deleteError } = await supabase.from('reservas').delete().in('id', duplicateIds)
      if (deleteError) throw deleteError
      stats.deduped += duplicateIds.length
    }

    // Si ya existe una con esas fechas y ese estado, actualizar y seguir
    const exactMatch = exactMatches[0]
    if (exactMatch?.id) {
      // Si la reserva en la base de datos ya tiene un cliente asignado,
      // o si su estado ya fue modificado a confirmada o finalizada, no la tocamos
      if (
        exactMatch.cliente_id ||
        exactMatch.estado === 'confirmada' ||
        exactMatch.estado === 'finalizada'
      ) {
        stats.skipped += 1
        continue
      }
      const { error: updateError } = await supabase.from('reservas').update(payload).eq('id', exactMatch.id)
      if (updateError) throw updateError
      stats.updated += 1
      continue
    }

    // Un conflicto real (externo) es cualquier reserva que se solape y:
    // - Sea de otro canal (ej. manual/Airbnb vs Booking)
    // - O ya tenga un cliente asignado
    // - O ya esté confirmada o finalizada
    const conflictoExterno = (overlaps ?? []).filter(
      (row) => protegida(row, canal)
    )

    if (conflictoExterno.length > 0) {
      // Si el evento iCal es un bloqueo ('cerrada'), recortamos el evento para insertar
      // únicamente los tramos de fechas que estén verdaderamente libres (sin cliente)
      if (estadoNuevo === 'cerrada') {
        const protectedSorted = [...conflictoExterno].sort((a, b) => (a.checkin || '').localeCompare(b.checkin || ''))
        let currentStart = checkin
        const tramos = []

        for (const prot of protectedSorted) {
          if (prot.checkin > currentStart) {
            tramos.push({ start: currentStart, end: prot.checkin < checkout ? prot.checkin : checkout })
          }
          if (prot.checkout > currentStart) {
            currentStart = prot.checkout
          }
        }
        if (currentStart < checkout) {
          tramos.push({ start: currentStart, end: checkout })
        }

        let procesadoAlgunTramo = false
        for (const tramo of tramos) {
          if (tramo.start >= tramo.end) continue
          const subPayload = { ...payload, checkin: tramo.start, checkout: tramo.end }

          const { data: subOverlaps, error: subError } = await supabase
            .from('reservas')
            .select('id, checkin, checkout, estado')
            .eq('propiedad_id', propiedadId)
            .lt('checkin', tramo.end)
            .gt('checkout', tramo.start)
            .neq('estado', 'cancelada')

          if (subError) throw subError
          if (!subOverlaps || subOverlaps.length === 0) {
            const { error: insertError } = await supabase.from('reservas').insert(subPayload)
            if (insertError) throw insertError
            stats.inserted += 1
            stats.insertedBloqueadas += 1
            procesadoAlgunTramo = true
          }
        }
        if (procesadoAlgunTramo) continue
      }

      stats.conflicts.push({ checkin, checkout, estado: estadoNuevo, reservas: conflictoExterno.map(row => ({ id: row.id, canal: row.canal_origen, estado: row.estado })) })
      continue
    }

    // Si hay overlaps sólo del mismo canal que son bloqueos/reservas no procesadas,
    // significa que las fechas se desplazaron o cambiaron en Booking.
    // Las eliminamos primero para evitar violar la restricción de exclusión Postgres "reservas_no_overlap"
    const solapamientosMismoCanal = (overlaps ?? []).filter(
      (row) =>
        !protegida(row, canal)
    )

    if (solapamientosMismoCanal.length > 0) {
      const idsBorrar = solapamientosMismoCanal.map((row) => row.id)
      const { error: deleteError } = await supabase.from('reservas').delete().in('id', idsBorrar)
      if (deleteError) throw deleteError
      stats.deduped += idsBorrar.length
    }

    // Sin conflictos: insertar
    const { error: insertError } = await supabase.from('reservas').insert(payload)
    if (insertError) throw insertError
    stats.inserted += 1
    if (esCerrada) {
      stats.insertedBloqueadas += 1
    } else {
      stats.insertedReservas += 1
      stats.nuevas.push({ checkin, checkout, summary: summaryRaw })
    }
  }

  return stats
}
