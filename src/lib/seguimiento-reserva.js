import { resumenCobros } from './cobros.js'

export function seguimientoReserva(r, pagos = [], mensajes = null) {
  if (['cerrada', 'cancelada'].includes(r.estado)) return []
  const cobro = resumenCobros(r, pagos)
  const plataforma = ['booking', 'airbnb'].includes(r.canal_origen)
  const mensual = r.modalidad === 'mensual'
  const datos = !!r.cliente_id && cobro.total !== null
  const detalleRegistrado = mensajes?.some(m => m.tipo === 'detalle' && m.enviado_el)
  const voucherRegistrado = mensajes?.some(m => m.tipo === 'voucher' && m.enviado_el)
  const detalle = !!r.detalle_enviado_el || detalleRegistrado
  const voucher = !!r.voucher_enviado_el || voucherRegistrado
  const puedeVoucher = ['confirmada', 'finalizada'].includes(r.estado) && cobro.recibido > 0 && datos
  return [
    { id: 'datos', titulo: 'Cliente y precio', estado: datos ? 'Completos' : 'Falta completar', completo: datos, accion: r.cliente_id ? 'pagos' : 'editar', boton: datos ? 'Ver datos' : 'Completar', ...(datos ? { accion: 'datos' } : {}) },
    { id: 'detalle', titulo: 'Detalle', estado: detalle ? 'Enviado' : plataforma ? 'Opcional' : cobro.recibido > 0 ? 'Pago ya recibido' : 'Por enviar', completo: !!detalle, opcional: plataforma || cobro.recibido > 0, accion: 'mensaje', tipo: 'detalle', boton: 'Preparar', habilitado: datos, campo: !detalle && cobro.recibido > 0 ? null : 'detalle_enviado_el', manual: !!r.detalle_enviado_el, registrado: !!detalleRegistrado },
    { id: 'pago', titulo: mensual ? 'Mensualidades' : plataforma || !cobro.requiereSena ? 'Cobros' : 'Seña', estado: cobro.recibido > 0 ? 'Pago registrado' : mensual ? 'Ver plan de cobros' : plataforma ? 'Según plataforma' : !cobro.requiereSena ? 'Sin seña requerida' : 'Pendiente', completo: cobro.recibido > 0, opcional: plataforma || mensual || !cobro.requiereSena, accion: 'cobrar', boton: mensual || plataforma || !cobro.requiereSena || cobro.recibido > 0 ? 'Ver cobros' : 'Registrar seña', habilitado: datos, abrir: !mensual && !plataforma && cobro.requiereSena && cobro.recibido === 0 },
    { id: 'voucher', titulo: 'Voucher', estado: voucher ? 'Enviado' : plataforma ? 'Opcional' : puedeVoucher ? 'Por enviar' : 'Después de confirmar', completo: !!voucher, opcional: plataforma, accion: 'mensaje', tipo: 'voucher', boton: 'Preparar', habilitado: puedeVoucher, campo: 'voucher_enviado_el', manual: !!r.voucher_enviado_el, registrado: !!voucherRegistrado },
  ]
}
