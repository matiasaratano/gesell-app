import { dinero } from './cobros.js'
import { direccionAlojamiento } from './direccion-alojamiento.js'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const plural = (n, uno, varios) => `${n} ${Number(n) === 1 ? uno : varios}`
const noches = (checkin, checkout) => Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000)

export const fechaSolicitud = value => value?.split('-').reverse().join('/') || ''

// "10 al 17 de enero" · "28 de diciembre al 4 de enero" · agrega el año solo si no es el actual
export function rangoFechas(desde, hasta) {
  if (!desde || !hasta) return ''
  const [y1, m1, d1] = desde.split('-').map(Number)
  const [y2, m2, d2] = hasta.split('-').map(Number)
  const conAnio = y1 !== y2 || y2 !== new Date().getFullYear()
  const sufijo = conAnio ? ` de ${y2}` : ''
  if (y1 === y2 && m1 === m2) return `${d1} al ${d2} de ${MESES[m2 - 1]}${sufijo}`
  const inicio = `${d1} de ${MESES[m1 - 1]}${y1 !== y2 ? ` de ${y1}` : ''}`
  return `${inicio} al ${d2} de ${MESES[m2 - 1]}${sufijo}`
}

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
  const total = Number(s.precio_total)
  const sena = Math.round(total * 30) / 100
  const cuentaPropia = propiedad.alias_cbu?.trim() === 'maratano.mp'
  const personas = s.adultos != null ? Number(s.adultos) + Number(s.menores || 0) : 0
  const resumen = [
    rangoFechas(s.checkin, s.checkout),
    plural(noches(s.checkin, s.checkout), 'noche', 'noches'),
    personas > 0 ? plural(personas, 'persona', 'personas') : '',
  ].filter(Boolean).join(' · ')
  // null = línea omitida · '' = renglón en blanco
  const armar = lineas => lineas.filter(l => l !== null).join('\n')

  return armar([
    `*Reserva ${propiedad.nombre}*`,
    resumen,
    `Total: ${dinero(total)}`,
    '',
    `*Para confirmar la reserva:* seña de ${dinero(sena)} (30%), dentro de las próximas 24 hs. El saldo de ${dinero(total - sena)} se abona al ingresar. Si ya pasó ese plazo, consultanos antes de transferir.`,
    '',
    'Podés abonar por transferencia o Mercado Pago:',
    ...(cuentaPropia ? ['Titular: Matías Nicolás Aratano', 'CVU: 0000003100056995782339'] : []),
    propiedad.alias_cbu ? `Alias: ${propiedad.alias_cbu}` : null,
    cuentaPropia ? 'CUIT/CUIL: 23-35727388-9' : null,
    '',
    'Cuando hayas hecho el pago, podés enviar el comprobante por acá y confirmamos la reserva.',
  ])
}

// Sin uso desde GeneradorMensajes (la ficha se genera ahí). Dejada por si otra pantalla la importa.
export function fichaSolicitud(s) {
  return `Para continuar con tu solicitud, completá estos datos:\nNombre:\nApellido:\nDNI:\nTeléfono:\nEmail:\nDomicilio:\nLocalidad:\n\nFechas acordadas: ${fechaSolicitud(s.checkin)} al ${fechaSolicitud(s.checkout)}.\nCompletar esta ficha no confirma la reserva ni bloquea fechas.`
}

export function voucherSolicitud(r) {
  const recibido = (r.pagos || []).filter(p => p.confirmado === true).reduce((sum, p) => sum + Number(p.monto), 0)
  if (!['confirmada', 'finalizada'].includes(r.estado) || recibido <= 0) throw new Error('La reserva debe estar confirmada y tener un pago registrado.')
  const saldo = Math.max(0, Number(r.precio_total) - recibido)
  const direccion = direccionAlojamiento(r.propiedades)
  // null = línea omitida · '' = renglón en blanco
  return [
    '*Reserva confirmada ✅*',
    '',
    `*Titular:* ${[r.clientes?.nombre, r.clientes?.apellido].filter(Boolean).join(' ')}`,
    `*Departamento:* ${r.propiedades?.nombre || ''}`,
    direccion ? `*Dirección:* ${direccion}` : null,
    `*Ingreso:* ${fechaSolicitud(r.checkin)}, desde las 14:00 hs`,
    `*Salida:* ${fechaSolicitud(r.checkout)}, hasta las 10:00 hs`,
    `*Huéspedes:* ${plural(r.adultos, 'adulto', 'adultos')} y ${plural(r.menores || 0, 'menor', 'menores')}`,
    '',
    `*Total:* ${dinero(r.precio_total)}`,
    `*Pagado:* ${dinero(recibido)}`,
    saldo > 0 ? `*Saldo al ingresar:* ${dinero(saldo)}` : '*Saldo:* sin saldo pendiente',
    '',
    'Cualquier consulta antes de tu llegada, escribinos por acá. ¡Los esperamos!',
  ].filter(l => l !== null).join('\n')
}

export function datosVoucherReserva(r) {
  return {
    titular: [r.clientes?.nombre, r.clientes?.apellido].filter(Boolean).join(' '),
    checkin: r.checkin || '', checkout: r.checkout || '',
    adultos: String(r.adultos ?? ''), menores: String(r.menores ?? 0),
    total: r.precio_total == null ? '' : String(r.precio_total),
    pagado: String((r.pagos || []).filter(p => p.confirmado === true).reduce((sum, p) => sum + Number(p.monto), 0)),
    verificado: ['confirmada', 'finalizada'].includes(r.estado) && (r.pagos || []).some(p => p.confirmado === true && Number(p.monto) > 0),
  }
}
