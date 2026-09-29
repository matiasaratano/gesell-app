const texto = value => String(value ?? '').trim()
const fechaValida = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value

export function datosReciboPago(reserva, pago) {
  const c = reserva?.clientes || {}
  const d = reserva?.propiedades || {}
  const datos = {
    nro: pago?.numero_recibo && fechaValida(pago?.fecha_recibido?.slice(0, 10)) ? `REC-${pago.fecha_recibido.slice(0, 4)}-${String(pago.numero_recibo).padStart(4, '0')}` : '', fecha: pago?.fecha_recibido?.slice(0, 10) || '', monto: pago?.monto ?? '',
    concepto: pago?.tipo === 'seña' ? 'reserva' : pago?.tipo || '',
    desde: reserva?.checkin || '', hasta: reserva?.checkout || '', formaPago: pago?.metodo || '',
    comprobante: pago?.comprobante_ref || '', nombre: [c.nombre, c.apellido].filter(Boolean).join(' ').trim(),
    dni: texto(c.dni), direccion: texto(c.domicilio), localidad: texto(c.ciudad),
    tel: texto(c.whatsapp), email: texto(c.email), periodo: pago?.periodo_mes?.slice(0, 7) || '',
  }
  const faltantes = []
  if (!reserva?.cliente_id || !c.nombre?.trim()) faltantes.push('Nombre del cliente')
  if (!datos.dni) faltantes.push('DNI del cliente')
  if (!datos.direccion) faltantes.push('Domicilio del cliente')
  if (!datos.localidad) faltantes.push('Localidad del cliente')
  if (!d.nombre?.trim()) faltantes.push('Nombre del alojamiento')
  if (!d.direccion?.trim()) faltantes.push('Dirección del alojamiento')
  if (!fechaValida(datos.desde) || !fechaValida(datos.hasta) || datos.hasta <= datos.desde) faltantes.push('Fechas de estadía válidas')
  if (!pago?.id || pago.reserva_id !== reserva?.id || pago.confirmado !== true) faltantes.push('Pago recibido y contabilizado de esta reserva')
  if (!Number.isFinite(Number(datos.monto)) || Number(datos.monto) <= 0) faltantes.push('Importe recibido mayor a cero')
  if (!fechaValida(datos.fecha)) faltantes.push('Fecha del cobro')
  if (!texto(datos.formaPago)) faltantes.push('Medio de pago')
  if (!['seña', 'saldo', 'total', 'mensualidad'].includes(pago?.tipo)) faltantes.push('Concepto del pago')
  if (pago?.tipo === 'mensualidad' && !fechaValida(pago.periodo_mes?.slice(0, 10))) faltantes.push('Mes abonado')
  return { datos, faltantes }
}
