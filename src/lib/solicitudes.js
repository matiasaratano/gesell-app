import { dinero } from './cobros.js'
import { direccionAlojamiento } from './direccion-alojamiento.js'
const separador = '━━━━━━━━━━━━━━━━━━━━━━━━━━━'
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
  const fechaLarga = valor => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${valor}T12:00:00Z`))
  const cuentaPropia = propiedad.alias_cbu?.trim() === 'maratano.mp'
  return [
    `Detalle de tu solicitud – ${propiedad.marca || 'Departamentos Norte'}`,
    `\n${separador}\nDETALLES DE LA RESERVA\n${separador}`,
    `• Departamento: ${propiedad.nombre}`,
    direccionAlojamiento(propiedad) ? `• Dirección: ${direccionAlojamiento(propiedad)}` : '',
    `• Check-in: ${fechaLarga(s.checkin)} a partir de las 14:00 hs.`,
    `• Check-out: ${fechaLarga(s.checkout)} hasta las 10:00 hs.`,
    `• Duración: ${Math.round((Date.parse(s.checkout) - Date.parse(s.checkin)) / 86400000)} noches`,
    s.adultos != null ? `• Huéspedes: ${s.adultos} adultos y ${s.menores || 0} menores` : '',
    `• Costo total: ${dinero(s.precio_total)}`,
    `• Seña para confirmar (30%): ${dinero(sena)}`,
    `• Saldo a pagar al ingresar: ${dinero(Number(s.precio_total) - sena)}`,
    `\n${separador}\nMÉTODO DE PAGO\n${separador}`,
    'Por favor, realizá la seña dentro de las 24 hs. Si pasó el plazo, escribinos antes de transferir.',
    'Transferencia bancaria o Mercado Pago.',
    ...(cuentaPropia ? ['Cuenta a nombre de Matías Nicolás Aratano:', '• CVU: 0000003100056995782339'] : []),
    propiedad.alias_cbu ? `• Alias: ${propiedad.alias_cbu}` : '',
    cuentaPropia ? '• CUIT/CUIL: 23-35727388-9' : '',
    '\nUna vez realizado el pago, envianos el comprobante para confirmar la reserva.',
    `\n${separador}\nPOLÍTICAS Y CONDICIONES\n${separador}`,
    '• No incluye ropa blanca (sábanas ni toallas).',
    '• Solo para familias (no se permiten grupos de jóvenes).',
    '• No está permitido realizar fiestas ni eventos.',
    propiedad.restriccion_vehiculos ? '• No está permitido ingresar vehículos al predio (motos, cuatriciclos, etc.).' : '',
    '• La reserva se confirma cuando verificamos el depósito del 30% y la disponibilidad.',
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
    direccionAlojamiento(r.propiedades) ? `Dirección: ${direccionAlojamiento(r.propiedades)}` : '',
    `Ingreso: ${fechaSolicitud(r.checkin)} · Salida: ${fechaSolicitud(r.checkout)}`,
    `Huéspedes: ${r.adultos} adultos y ${r.menores || 0} menores`,
    `Precio total: ${dinero(r.precio_total)}`,
    `Pagos recibidos: ${dinero(recibido)}`,
    `Saldo pendiente: ${dinero(Math.max(0, Number(r.precio_total) - recibido))}`,
    'Tu reserva está confirmada. Conservá este detalle para tu estadía.',
  ].filter(Boolean).join('\n')
}

export function datosVoucherReserva(r) {
  return {
    titular: [r.clientes?.nombre, r.clientes?.apellido].filter(Boolean).join(' '),
    checkin: r.checkin || '', checkout: r.checkout || '',
    adultos: String(r.adultos ?? ''), menores: String(r.menores ?? 0),
    total: r.precio_total == null ? '' : String(r.precio_total),
    pagado: String((r.pagos || []).filter(p=>p.confirmado === true).reduce((sum,p)=>sum+Number(p.monto),0)),
    verificado: ['confirmada','finalizada'].includes(r.estado) && (r.pagos || []).some(p=>p.confirmado === true && Number(p.monto)>0),
  }
}
