import test from 'node:test'
import assert from 'node:assert/strict'
import { resumenCobros, parseImporte } from './cobros.js'

const reserva = { checkin: '2027-01-01', checkout: '2027-01-10', precio_total: 900000 }
test('centavos no dejan saldos residuales al completar un pago', () => {
  const r = resumenCobros({ ...reserva, precio_total: 0.8 }, [{ monto: 0.1, confirmado: true }, { monto: 0.7, confirmado: true }])
  assert.equal(r.recibido,0.8)
  assert.equal(r.saldo,0)
  assert.equal(r.estado,'pagada')
})
test('solo contabiliza dinero confirmado; confirmada no significa pagada', () => {
  assert.equal(resumenCobros({ ...reserva, estado: 'confirmada' }).estado, 'sin-sena')
  const resumen = resumenCobros(reserva, [
    { monto: 270000, confirmado: true }, { monto: 100000, confirmado: false }, { monto: 0, confirmado: false },
  ])
  assert.equal(resumen.recibido, 270000)
  assert.equal(resumen.saldo, 630000)
  assert.equal(resumen.estado, 'con-sena')
})
test('pago completo y exceso sin saldo negativo', () => {
  const resumen = resumenCobros(reserva, [{ monto: 950000, confirmado: true }])
  assert.equal(resumen.estado, 'pagada')
  assert.equal(resumen.saldo, 0)
  assert.equal(resumen.excedente, 50000)
})
test('usa el total acordado también en estadías largas', () => {
  const pagos = [{ monto: 300000, confirmado: true }]
  const mensual = resumenCobros({ ...reserva, checkout: '2027-06-01', precio_total: 2450000, requiere_sena: false }, pagos)
  assert.equal(mensual.total, 2450000)
  assert.equal(mensual.saldo, 2150000)
  assert.equal(mensual.estado, 'sin-requisito')
  assert.equal(resumenCobros({ ...reserva, precio_total: null }, pagos).saldo, null)
})
test('sin requisito no significa pagada ni debe aparecer como sin seña', () => {
  const exenta = { ...reserva, requiere_sena: false }
  assert.equal(resumenCobros(exenta).estado, 'sin-requisito')
  assert.equal(resumenCobros(exenta).saldo, 900000)
  assert.equal(resumenCobros(exenta, [{ monto: 900000, confirmado: true }]).estado, 'pagada')
  assert.equal(resumenCobros({ ...reserva, requiere_sena: true }).estado, 'sin-sena')
})
test('importes argentinos con miles y centavos', () => {
  assert.equal(parseImporte('270.000'), 270000)
  assert.equal(parseImporte('270.000,50'), 270000.5)
  assert.equal(parseImporte('270000.50'), 270000.5)
  assert.equal(parseImporte('270000,50'), 270000.5)
  for (const entrada of ['', '1e5', '1,234', '-1', '12.3456', 'abc']) assert.ok(Number.isNaN(parseImporte(entrada)))
})
