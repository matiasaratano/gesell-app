const day = value => Date.parse(`${value}T00:00:00Z`) / 86400000
export function valorEnPeriodo(reserva, desde, hasta) {
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
