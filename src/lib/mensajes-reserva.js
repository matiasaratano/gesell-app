import { detalleSolicitud, voucherSolicitud } from './solicitudes.js'
import { mensajeReserva } from './operacion-reserva.js'

export function snapshotMensaje({ clientes, propiedades, pagos = [], ...reserva }) {
  return { reserva, cliente: clientes, propiedad: propiedades, pagos: [...pagos].sort((a, b) => a.id.localeCompare(b.id)) }
}

export function textoMensajeReserva(r, tipo) {
  if (['cerrada', 'cancelada'].includes(r.estado)) throw new Error('Esta reserva no admite detalle ni voucher.')
  if (!r.clientes?.nombre?.trim() || !r.propiedades?.nombre?.trim() || !(Number(r.precio_total) > 0)) throw new Error('Completá cliente, alojamiento y precio antes de preparar el mensaje.')
  if (tipo === 'voucher') return voucherSolicitud(r)
  const recibido = (r.pagos || []).filter(p => p.confirmado && Number(p.monto) > 0).reduce((s, p) => s + Number(p.monto), 0)
  if (r.modalidad === 'mensual' || recibido > 0 || r.requiere_sena === false) return mensajeReserva(r, r.pagos || [])
  if (!r.propiedades?.alias_cbu) throw new Error('Completá el alias de cobro del alojamiento antes de preparar el detalle.')
  return detalleSolicitud(r, r.propiedades)
}
