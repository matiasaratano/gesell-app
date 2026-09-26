import { dinero, nombreCliente, resumenCobros } from './cobros.js'
import { hoyLocal } from './operacion-reserva.js'
import { cuotasMensuales, mesAnterior, sumarDias } from './mensualidades.js'

export function tareasReservas(reservas, hoy = hoyLocal()) {
  return reservas.flatMap(r => {
    if (['cerrada', 'cancelada'].includes(r.estado)) return []
    const avisos = []
    const ficha = `/reservas/${r.id}`
    const agregar = (id, texto, desde, enlace = ficha, prioridad = 2) => avisos.push({ id, texto, desde, enlace, prioridad })
    const vigente = r.checkout >= hoy && r.estado !== 'finalizada'
    const booking = r.canal_origen === 'booking'
    const mensual = r.modalidad === 'mensual'
    const contactoDesde = sumarDias(r.checkin, -45)
    const prepararDesde = booking ? contactoDesde : hoy
    const cobro = resumenCobros(r, r.pagos || [])
    if (vigente) {
      if (!r.cliente_id) agregar('cliente', 'Falta cliente', prepararDesde, `${ficha}?accion=editar`)
      if (cobro.total === null) agregar('precio', 'Falta precio total', prepararDesde, `${ficha}?vista=pagos`)
      if (booking && !r.booking_contactado_el) agregar('contacto', 'Contactar al huésped de Booking', contactoDesde)
      if (!mensual && cobro.requiereSena && cobro.recibido === 0) agregar('sena', booking ? 'Sin pagos registrados · verificar condiciones de cobro en Booking' : 'Sin seña registrada', booking ? mesAnterior(r.checkin) : hoy, `${ficha}?vista=pagos`)
      if (!mensual && cobro.saldo > 0 && cobro.recibido > 0) agregar('saldo', `Saldo por cobrar: ${dinero(cobro.saldo)}`, r.checkin, `${ficha}?vista=pagos`, 1)
      if (mensual && !r.plan_mensual?.length) agregar('plan', 'Definir mensualidades', hoy, `${ficha}?vista=pagos`)
    }
    if (mensual) for (const c of cuotasMensuales(r, r.pagos || [], hoy)) {
      if (!c.saldo) continue
      agregar(`mes-${c.mes}`, `${c.vencida ? 'Vencida' : c.estado === 'parcial' ? 'Mensualidad parcial' : 'Mensualidad'} ${c.mes.slice(0, 7).split('-').reverse().join('/')} · ${dinero(c.saldo)}`, c.vencimiento, `${ficha}?vista=pagos&mes=${c.mes.slice(0, 7)}`, c.vencida ? 0 : 1)
    }
    if (!avisos.length) return []
    const actuales = avisos.filter(a => a.desde <= hoy)
    const futuras = avisos.filter(a => a.desde > hoy).sort((a, b) => a.desde.localeCompare(b.desde))
    const pospuestaHasta = r.recordar_el || null
    const grupo = pospuestaHasta > hoy ? 'pospuestas' : actuales.length ? 'pendientes' : 'futuras'
    const visibles = grupo === 'futuras' ? futuras : [...actuales, ...futuras]
    return [{ id: r.id, reservaId: r.id, titulo: nombreCliente(r), propiedad: r.propiedades?.nombre || 'Sin alojamiento', checkin: r.checkin, checkout: r.checkout, avisos: visibles, grupo, pospuestaHasta, proximaFecha: futuras[0]?.desde, prioridad: Math.min(...(actuales.length ? actuales : futuras).map(a => a.prioridad)) }]
  }).sort((a, b) => a.prioridad - b.prioridad || (a.grupo === 'futuras' ? a.proximaFecha.localeCompare(b.proximaFecha || b.checkin) : a.checkin.localeCompare(b.checkin)))
}
