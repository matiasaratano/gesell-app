const day = value => Date.parse(`${value}T00:00:00Z`) / 86400000
export function ticketTemporal(reservas, desde, hasta) {
  const temporales = reservas.filter(r => r.modalidad !== 'mensual' && !['cerrada', 'cancelada'].includes(r.estado) && r.checkin <= hasta && r.checkout > desde)
  return temporales.length ? Math.round(temporales.reduce((total, r) => total + valorEnPeriodo(r, desde, hasta), 0) / temporales.length) : null
}
export function valorEnPeriodo(reserva, desde, hasta) {
  if (reserva.modalidad === 'mensual') {
    const inicio = Math.max(day(reserva.checkin), day(desde))
    const fin = Math.min(day(reserva.checkout), day(hasta) + 1)
    if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) return 0
    const cuotas = new Map((reserva.plan_mensual || []).map(c => [c.mes.slice(0, 7), Number(c.importe)]))
    const cursor = new Date(inicio * 86400000)
    cursor.setUTCDate(1)
    let total = 0
    while (cursor.getTime() / 86400000 < fin) {
      const mes = cursor.toISOString().slice(0, 7)
      const comienzo = Math.max(cursor.getTime() / 86400000, day(reserva.checkin))
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
      const final = Math.min(cursor.getTime() / 86400000, day(reserva.checkout))
      const importe = cuotas.get(mes)
      if (!Number.isFinite(importe) || importe <= 0) return null
      // Partial ranges use the agreed month's occupied days, never the whole stay's average.
      total += importe * (Math.min(fin, final) - Math.max(inicio, comienzo)) / (final - comienzo)
    }
    return Math.round(total * 100) / 100
  }
  const precio = Number(reserva.precio_total)
  const inicio = day(reserva.checkin), fin = day(reserva.checkout)
  const noches = fin - inicio
  const ocupadas = Math.max(0, Math.min(fin, day(hasta) + 1) - Math.max(inicio, day(desde)))
  if (!Number.isFinite(precio) || precio <= 0 || !Number.isFinite(ocupadas) || noches <= 0) return 0
  return Math.round(precio * ocupadas / noches)
}
export function valoresPorCanal(reservas, desde, hasta) {
  const canales = {}
  for (const r of reservas) {
    if (['cerrada','cancelada'].includes(r.estado)) continue
    const canal = r.canal_origen || 'directo'
    canales[canal] ||= { count: 0, ingresos: 0 }
    canales[canal].count++
    canales[canal].ingresos += valorEnPeriodo(r, desde, hasta)
  }
  return canales
}
