import { resumenCobros } from './cobros.js'
import { cuotasMensuales } from './mensualidades.js'
import { hoyLocal } from './operacion-reserva.js'

export function proximaAccion(r, pagos = [], mensajes = null, hoy = hoyLocal()) {
  if (['cerrada', 'cancelada'].includes(r.estado)) return null
  const cobro = resumenCobros(r, pagos)
  if (!r.cliente_id) return { texto: 'Asignar un cliente a la reserva', accion: 'editar', boton: 'Asignar cliente' }
  if (cobro.total === null) return { texto: 'Completar el precio acordado', accion: 'pagos', boton: 'Completar precio' }
  if (r.modalidad === 'mensual') {
    if (!r.plan_mensual?.length) return { texto: 'Definir las mensualidades', accion: 'pagos', boton: 'Definir meses' }
    if (cuotasMensuales(r, pagos, hoy).some(c => c.saldo > 0 && c.vencimiento <= hoy)) return { texto: 'Hay mensualidades por cobrar', accion: 'pagos', boton: 'Ver mensualidades' }
  }
  if (r.estado === 'pendiente' && cobro.recibido > 0) return { texto: 'Hay un pago registrado y la reserva sigue pendiente', accion: 'editar', boton: 'Revisar estado' }
  if (r.checkout <= hoy && r.limpieza_completada_para !== r.checkout) return { texto: 'Marcar la limpieza después de la salida', accion: 'datos', boton: 'Ver limpieza' }
  if (r.checkin <= hoy && r.modalidad !== 'mensual' && cobro.saldo > 0) return { texto: 'Revisar el saldo pendiente de la estadía', accion: 'pagos', boton: 'Ver cobros' }
  if (['confirmada', 'finalizada'].includes(r.estado) && cobro.recibido > 0 && !r.voucher_enviado_el && mensajes && !mensajes.some(m => m.tipo === 'voucher' && m.enviado_el)) return { texto: 'El voucher todavía no está marcado como enviado', accion: 'mensaje', tipo: 'voucher', boton: 'Preparar voucher' }
  if (r.estado === 'pendiente' && r.modalidad !== 'mensual' && cobro.requiereSena && r.checkout > hoy && cobro.recibido === 0 && r.canal_origen !== 'booking' && r.canal_origen !== 'airbnb') {
    if (r.detalle_enviado_el || mensajes?.some(m => m.tipo === 'detalle' && m.enviado_el)) return { texto: 'Detalle enviado · esperando la seña', accion: 'cobrar', abrir: true, boton: 'Registrar seña' }
    return { texto: 'Preparar el detalle o registrar la seña recibida', accion: 'mensaje', tipo: 'detalle', boton: 'Preparar detalle' }
  }
  return null
}
