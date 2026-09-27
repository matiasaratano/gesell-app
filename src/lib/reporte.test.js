import test from 'node:test'
import assert from 'node:assert/strict'
import { valorEnPeriodo, valoresPorCanal, ticketTemporal } from './reporte.js'
const reserva = { checkin: '2026-09-15', checkout: '2026-10-15', precio_total: '300000', estado: 'confirmada', canal_origen: 'directo' }
const mensual = { ...reserva, modalidad: 'mensual', checkin: '2026-04-05', checkout: '2026-11-05', precio_total: 2450000, plan_mensual: [{ mes: '2026-09-01', importe: 350000 }, { mes: '2026-10-01', importe: 400000 }] }
test('ticket temporal excluye mensuales, cierres y canceladas del importe y del divisor', () => {
  const temporal = { ...reserva, checkin: '2026-09-25', checkout: '2026-09-26', precio_total: 10000 }
  assert.equal(ticketTemporal([mensual, temporal, {...temporal, estado:'cerrada'}, {...temporal, estado:'cancelada'}], '2026-09-01', '2026-09-30'),10000)
  assert.equal(ticketTemporal([mensual], '2026-09-01', '2026-09-30'),null)
  assert.equal(ticketTemporal([temporal], '2026-10-01', '2026-10-31'),null)
})
test('mensual usa cuota acordada y no promedio por noche del total', () => {
  assert.equal(valorEnPeriodo(mensual,'2026-09-01','2026-09-30'),350000)
  assert.equal(valorEnPeriodo(mensual,'2026-10-01','2026-10-31'),400000)
  assert.equal(valorEnPeriodo(mensual,'2026-09-01','2026-10-31'),750000)
  assert.equal(valorEnPeriodo(mensual,'2026-09-01','2026-09-15'),175000)
  assert.equal(valoresPorCanal([mensual],'2026-09-01','2026-09-30').directo.ingresos,350000)
})
test('mensual sin cuota no inventa un importe; checkout sigue siendo exclusivo', () => {
  assert.equal(valorEnPeriodo(mensual,'2026-08-01','2026-09-30'),null)
  assert.equal(valorEnPeriodo({...mensual,plan_mensual:[]},'2026-09-01','2026-09-30'),null)
  assert.equal(valorEnPeriodo(mensual,'2026-11-05','2026-11-30'),0)
})
test('el total por canal usa el mismo prorrateo que el período, incluso precios de texto', () => {
  assert.equal(valorEnPeriodo(reserva, '2026-09-01','2026-09-30'),160000)
  const canales=valoresPorCanal([reserva,reserva,{...reserva,estado:'cerrada'},{...reserva,estado:'cancelada'}],'2026-09-01','2026-09-30')
  assert.deepEqual(canales.directo,{count:2,ingresos:320000})
})
test('checkout exclusivo, días del período inclusivos y fechas sin solapamiento', () => {
  assert.equal(valorEnPeriodo(reserva,'2026-10-15','2026-10-31'),0)
  assert.equal(valorEnPeriodo(reserva,'2026-09-30','2026-09-30'),10000)
  assert.equal(valorEnPeriodo(reserva,'2026-09-01','2026-10-31'),300000)
  assert.equal(valorEnPeriodo({...reserva,precio_total:null},'2026-09-01','2026-09-30'),0)
})
