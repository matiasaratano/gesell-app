export const cierreImportadoDisponible = r => r.estado === 'cerrada'
  && ['booking', 'airbnb'].includes(r.canal_origen) && !r.cliente_id
  && Number(r.precio_total || 0) === 0 && Array.isArray(r.pagos) && !r.pagos.length

export const consentimientoCierres = rows => rows.map(({ id, checkin, checkout, canal_origen }) => ({ id, checkin, checkout, canal_origen }))

export async function revisarDisponibilidadSolicitud(db, s) {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('reservas')
      .select('id,checkin,checkout,estado,canal_origen,cliente_id,precio_total,pagos(id)')
      .eq('propiedad_id', s.propiedad_id).neq('estado', 'cancelada')
      .lt('checkin', s.checkout).gt('checkout', s.checkin).order('id').range(offset, offset + 499)
    if (error) throw new Error('No se pudo comprobar la disponibilidad. Reintentá antes de continuar.')
    rows.push(...data)
    if (data.length < 500) break
  }
  const bloqueos = await db.from('bloqueos').select('id').eq('propiedad_id', s.propiedad_id)
    .lt('fecha_inicio', s.checkout).gt('fecha_fin', s.checkin).limit(1)
  if (bloqueos.error) throw new Error('No se pudieron comprobar los cierres manuales.')
  if (bloqueos.data.length || rows.some(r => !cierreImportadoDisponible(r))) {
    throw Object.assign(new Error('Hay una reserva o un cierre gestionado en estas fechas. No se puede solicitar la seña ni confirmar otra reserva. Revisá el calendario o elegí otro departamento.'), { code: 'FECHAS_OCUPADAS', solicitudId: s.id })
  }
  return consentimientoCierres(rows)
}
