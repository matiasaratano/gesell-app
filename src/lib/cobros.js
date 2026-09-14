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
  style: 'currency', currency: 'ARS', maximumFractionDigits: 2,
}).format(value)
export const nombreCliente = r => `${r.clientes?.nombre || ''} ${r.clientes?.apellido || ''}`.trim() || 'Sin cliente'
export const normalizarBusqueda = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
