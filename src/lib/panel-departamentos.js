import { pendientesLimpieza } from './operacion-reserva.js'
import { cuotasMensuales, sumarDias } from './mensualidades.js'
import { resumenCobros } from './cobros.js'

export function vistaDepartamento(reservas, propiedadId = '') {
  return propiedadId ? reservas.filter(r => r.propiedad_id === propiedadId) : reservas
}

export function ingresosManana(reservas, hoy) {
  return reservas.filter(r => r.checkin === sumarDias(hoy, 1) && !['cerrada', 'cancelada', 'finalizada'].includes(r.estado))
}

export function estadoDepartamento(propiedad, reservas, hoy) {
  const filas = vistaDepartamento(reservas, propiedad.id).filter(r => r.estado !== 'cancelada')
  const actuales = filas.filter(r => r.checkin <= hoy && hoy < r.checkout && r.estado !== 'finalizada')
  const huesped = actuales.find(r => r.estado !== 'cerrada')
  const cierre = actuales.find(r => r.estado === 'cerrada')
  const movimientos = filas.flatMap(r => r.estado === 'cerrada' || r.estado === 'finalizada' ? [] : [
    ...(r.checkin >= hoy ? [{ reserva: r, fecha: r.checkin, tipo: 'Ingresa' }] : []),
    ...(r.checkout >= hoy ? [{ reserva: r, fecha: r.checkout, tipo: 'Sale' }] : []),
  ]).sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.tipo === b.tipo ? 0 : a.tipo === 'Sale' ? -1 : 1))
  const proxima = movimientos[0] || null
  const reserva = huesped || proxima?.reserva || null
  const limpieza = pendientesLimpieza(filas.filter(r => r.checkout <= hoy))[0] || null
  const deudaMensual = filas.filter(r => r.modalidad === 'mensual').flatMap(r =>
    cuotasMensuales(r, r.pagos || [], hoy).filter(c => c.vencida && c.saldo > 0).map(c => ({ reserva: r, cuota: c })))
    .sort((a, b) => a.cuota.vencimiento.localeCompare(b.cuota.vencimiento))[0] || null
  return { propiedad, estado: huesped ? 'Ocupado' : cierre ? 'Cerrado' : 'Libre', huesped, cierre,
    proxima, reserva, limpieza, deudaMensual, cobros: reserva ? resumenCobros(reserva, reserva.pagos || []) : null }
}
