import { dinero } from './cobros.js'
export const fechaSolicitud = value => value?.split('-').reverse().join('/') || ''
export const solicitudLista = s => !!s.propiedad_id && Number(s.precio_total) > 0
export function vistaSolicitud(s, hoy) {
  return s.estado === 'confirmada' && s.salida_reserva && s.salida_reserva <= hoy ? 'archivada' : s.estado
}
export function solicitudesAccionables(rows, propiedadId = '') {
  return rows.filter(s => s.estado === 'abierta' && (!propiedadId || !s.propiedad_id || s.propiedad_id === propiedadId))
    .sort((a, b) => a.checkin.localeCompare(b.checkin) || a.id.localeCompare(b.id))
}
export function detalleSolicitud(s, propiedad) {
  if (!propiedad || !Number.isFinite(Number(s.precio_total)) || Number(s.precio_total) <= 0) throw new Error('Asigná un departamento y un precio antes de preparar la seña.')
  const sena = Math.round(Number(s.precio_total) * 30) / 100
  return [
    `Hola ${s.datos_cliente.nombre}, este es el detalle de tu solicitud (sin confirmar):`,
    `Alojamiento: ${propiedad.nombre}`,
    `Ingreso: ${fechaSolicitud(s.checkin)} · Salida: ${fechaSolicitud(s.checkout)}`,
    `Huéspedes: ${s.adultos} adultos y ${s.menores} menores`,
    `Total: ${dinero(s.precio_total)}`,
    `Seña para confirmar (30%): ${dinero(sena)}`,
    `Saldo después de esa seña: ${dinero(Number(s.precio_total) - sena)}`,
    propiedad.alias_cbu ? `Alias para transferir: ${propiedad.alias_cbu}` : '',
    'Esta solicitud no bloquea fechas ni garantiza disponibilidad. Consultanos antes de transferir. La reserva se confirma cuando verificamos el pago y la disponibilidad.',
  ].filter(Boolean).join('\n')
}
export function fichaSolicitud(s) {
  return `Para continuar con tu solicitud, completá estos datos:\nNombre:\nApellido:\nDNI:\nTeléfono:\nEmail:\nDomicilio:\nLocalidad:\n\nFechas acordadas: ${fechaSolicitud(s.checkin)} al ${fechaSolicitud(s.checkout)}.\nCompletar esta ficha no confirma la reserva ni bloquea fechas.`
}

export function voucherSolicitud(r) {
  const recibido = (r.pagos || []).filter(p => p.confirmado === true).reduce((sum, p) => sum + Number(p.monto), 0)
  if (!['confirmada', 'finalizada'].includes(r.estado) || recibido <= 0) throw new Error('La reserva debe estar confirmada y tener un pago registrado.')
  return [
    'CONFIRMACIÓN DE RESERVA',
    `Titular: ${[r.clientes?.nombre, r.clientes?.apellido].filter(Boolean).join(' ')}`,
    `Alojamiento: ${r.propiedades?.nombre || ''}`,
    r.propiedades?.direccion ? `Dirección: ${r.propiedades.direccion}` : '',
    `Ingreso: ${fechaSolicitud(r.checkin)} · Salida: ${fechaSolicitud(r.checkout)}`,
    `Huéspedes: ${r.adultos} adultos y ${r.menores || 0} menores`,
    `Precio total: ${dinero(r.precio_total)}`,
    `Pagos recibidos: ${dinero(recibido)}`,
    `Saldo pendiente: ${dinero(Math.max(0, Number(r.precio_total) - recibido))}`,
    'Tu reserva está confirmada. Conservá este detalle para tu estadía.',
  ].filter(Boolean).join('\n')
}
