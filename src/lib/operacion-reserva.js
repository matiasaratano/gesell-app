import { dinero, nombreCliente, parseImporte, resumenCobros } from './cobros.js'

export function hoyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function pagoVacio(tipo = 'seña') {
  return { tipo, monto: '', fecha_recibido: hoyLocal(), metodo: 'transferencia', periodo_mes: '' }
}
export function datosPago(form, id) {
  const monto = parseImporte(form.monto)
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('Ingresá un importe mayor a cero, con hasta dos decimales.')
  if (!form.fecha_recibido) throw new Error('Elegí la fecha del cobro.')
  if (form.tipo === 'mensualidad' && !/^\d{4}-\d{2}$/.test(form.periodo_mes)) throw new Error('Elegí el mes que estás cobrando.')
  return { ...form, id, monto, periodo_mes: form.tipo === 'mensualidad' ? `${form.periodo_mes}-01` : null }
}
export function mensualidades(pagos) {
  const grupos = new Map()
  for (const p of pagos) {
    if (p.tipo !== 'mensualidad' || !p.confirmado || !p.periodo_mes) continue
    const mes = p.periodo_mes.slice(0, 7)
    grupos.set(mes, (grupos.get(mes) || 0) + Math.round(Number(p.monto) * 100))
  }
  return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, centavos]) => [mes, centavos / 100])
}
export function mensajeReserva(reserva, pagos) {
  const r = resumenCobros(reserva, pagos)
  const fecha = x => x?.split('-').reverse().join('/') || 'A definir'
  return [
    `Hola ${nombreCliente(reserva)}, te paso el detalle de tu reserva:`,
    `Alojamiento: ${reserva.propiedades?.nombre || 'A definir'}`,
    `Ingreso: ${fecha(reserva.checkin)}`,
    `Salida: ${fecha(reserva.checkout)}`,
    `Total de la estadía: ${r.total === null ? 'A definir' : dinero(r.total)}`,
    `Recibido: ${dinero(r.recibido)}`,
    `Saldo: ${r.saldo === null ? 'A definir' : dinero(r.saldo)}`,
    ...(r.excedente > 0 ? [`A favor: ${dinero(r.excedente)}`] : []),
  ].join('\n')
}
export function pendientesLimpieza(reservas) {
  const ultimas = new Map()
  for (const r of reservas) {
    if (['cerrada', 'cancelada'].includes(r.estado)) continue
    const actual = ultimas.get(r.propiedad_id)
    if (!actual || r.checkout > actual.checkout) ultimas.set(r.propiedad_id, r)
  }
  return [...ultimas.values()].filter(r => r.limpieza_completada_para !== r.checkout)
}
