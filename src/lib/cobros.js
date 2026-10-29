export function resumenCobros(reserva, pagos = []) {
  const recibido = pagos.filter(p => p.confirmado === true && Number(p.monto) > 0)
    .reduce((total, p) => total + Math.round(Number(p.monto) * 100), 0) / 100
  const precio = Number(reserva.precio_total)
  const total = Number.isFinite(precio) && precio > 0 ? precio : null
  const requiereSena = reserva.requiere_sena !== false
  return {
    recibido, total, requiereSena,
    saldo: total === null ? null : Math.max(0, Math.round((total - recibido) * 100) / 100),
    excedente: total === null ? 0 : Math.max(0, Math.round((recibido - total) * 100) / 100),
    estado: total !== null && recibido >= total ? 'pagada' : !requiereSena ? 'sin-requisito' : recibido > 0 ? 'con-sena' : 'sin-sena',
  }
}

export function parseImporte(value) {
  const texto = String(value).trim()
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(texto)) return Number(texto.replace(/\./g, '').replace(',', '.'))
  if (/^\d+([,.]\d{1,2})?$/.test(texto)) return Number(texto.replace(',', '.'))
  return NaN
}

export const dinero = value => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(value)
export function colorCobro(r) {
  return r.mesesPendientes?.length || r.cobro.total === null || r.cobro.estado === 'sin-sena'
    ? 'amarilla' : r.cobro.estado === 'pagada' ? 'verde' : 'blanca'
}
export function compararCobros(a, b, orden = 'ingreso') {
  const grupos = { verde: ['verde', 'amarilla', 'blanca'], amarilla: ['amarilla', 'blanca', 'verde'], blanca: ['blanca', 'verde', 'amarilla'] }[orden]
  const diferencia = grupos ? grupos.indexOf(colorCobro(a)) - grupos.indexOf(colorCobro(b)) : 0
  return diferencia || a.checkin.localeCompare(b.checkin) || a.id.localeCompare(b.id)
}
export const nombreCliente = r => `${r.clientes?.nombre || ''} ${r.clientes?.apellido || ''}`.trim() || 'Sin cliente'
export const normalizarBusqueda = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
