import { parseImporte } from './cobros.js'
import { hoyLocal, mensualidades } from './operacion-reserva.js'

const iso = date => date.toISOString().slice(0, 10)
export function sumarDias(fecha, dias) {
  const date = new Date(`${fecha}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + dias)
  return iso(date)
}
export function mesAnterior(fecha) {
  const [y, m, d] = fecha.split('-').map(Number)
  const ultimo = new Date(Date.UTC(y, m - 1, 0)).getUTCDate()
  return iso(new Date(Date.UTC(y, m - 2, Math.min(d, ultimo))))
}
export function limitesMeses(reserva) {
  return { min: reserva.checkin.slice(0, 7), max: sumarDias(reserva.checkout, -1).slice(0, 7) }
}
export function cuotasMensuales(reserva, pagos = [], hoy = hoyLocal()) {
  const recibidos = new Map(mensualidades(pagos))
  return (reserva.plan_mensual || []).map(c => {
    const recibido = recibidos.get(c.mes.slice(0, 7)) || 0
    const saldo = Math.max(0, Math.round((Number(c.importe) - recibido) * 100) / 100)
    return { ...c, recibido, saldo, estado: saldo === 0 ? 'pagado' : recibido > 0 ? 'parcial' : 'pendiente', vencida: saldo > 0 && c.vencimiento < hoy }
  }).sort((a, b) => a.mes.localeCompare(b.mes))
}
export function generarCuotas(reserva, { desde, hasta, importe, dia }) {
  const limites = limitesMeses(reserva)
  const monto = parseImporte(importe)
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('Ingresá un importe mensual mayor a cero.')
  if (![desde, hasta].every(m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) || desde > hasta || desde < limites.min || hasta > limites.max) throw new Error('Elegí meses dentro de la estadía, en orden.')
  if (!Number.isInteger(Number(dia)) || Number(dia) < 1 || Number(dia) > 31) throw new Error('El día de vencimiento debe estar entre 1 y 31.')
  const cuotas = []
  const [y, m] = desde.split('-').map(Number)
  const cursor = new Date(Date.UTC(y, m - 1, 1))
  while (iso(cursor).slice(0, 7) <= hasta) {
    if (cuotas.length >= 120) throw new Error('Agregá hasta 120 meses por vez.')
    const mes = iso(cursor)
    const ultimo = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate()
    cuotas.push({ mes, importe: monto, vencimiento: `${mes.slice(0, 7)}-${String(Math.min(Number(dia), ultimo)).padStart(2, '0')}` })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  const existentes = new Set((reserva.plan_mensual || []).map(c => c.mes))
  const nuevas = cuotas.filter(c => !existentes.has(c.mes))
  if (!nuevas.length) throw new Error('Esos meses ya están cargados. Podés ajustarlos individualmente.')
  return [...(reserva.plan_mensual || []), ...nuevas].sort((a, b) => a.mes.localeCompare(b.mes))
}
