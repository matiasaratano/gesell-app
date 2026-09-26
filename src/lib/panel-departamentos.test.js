import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoDepartamento, ingresosManana, vistaDepartamento } from './panel-departamentos.js'

const p = { id: 'p1', nombre: 'Depto 1' }
const r = { id: 'r1', propiedad_id: 'p1', checkin: '2026-12-28', checkout: '2027-01-03', estado: 'confirmada', precio_total: 1000, pagos: [{ monto: 300, confirmado: true }] }
test('filter is by property ID and tomorrow crosses month/year boundaries', () => {
  const tomorrow = { ...r, id: 'tomorrow', checkin: '2027-01-01' }
  const rows = [r, tomorrow, { ...tomorrow, id: 'blocked', estado: 'cerrada' }, { ...tomorrow, id: 'cancelled', estado: 'cancelada' }, { ...tomorrow, id: 'other', propiedad_id: 'p2' }]
  assert.deepEqual(ingresosManana(vistaDepartamento(rows, 'p1'), '2026-12-31').map(r => r.id), ['tomorrow'])
  assert.equal(vistaDepartamento(rows).length, rows.length)
})
test('occupied excludes closures, checkout is exclusive, payment totals stay distinct', () => {
  const state = estadoDepartamento(p, [r], '2027-01-02')
  assert.equal(state.estado, 'Ocupado')
  assert.equal(state.cobros.saldo, 700)
  assert.equal(state.proxima.tipo, 'Sale')
  const salida = estadoDepartamento(p, [r], '2027-01-03')
  assert.equal(salida.estado, 'Libre')
  assert.equal(salida.limpieza.id, r.id)
  assert.equal(estadoDepartamento(p, [{ ...r, estado: 'cerrada' }], '2027-01-02').estado, 'Cerrado')
})
test('cleaning uses latest checkout and ignores cancelled or closed rows', () => {
  const clean = { ...r, id: 'clean', checkin: '2027-01-04', checkout: '2027-01-06', limpieza_completada_para: '2027-01-06' }
  assert.equal(estadoDepartamento(p, [r, clean, { ...clean, id: 'closed', estado: 'cerrada', checkout: '2027-01-07' }], '2027-01-08').limpieza, null)
})
test('overdue monthly payments remain actionable after checkout', () => {
  const monthly = { ...r, modalidad: 'mensual', plan_mensual: [{ mes: '2027-01-01', importe: 1000, vencimiento: '2027-01-02' }], pagos: [] }
  const state = estadoDepartamento(p, [monthly], '2027-01-10')
  assert.equal(state.estado, 'Libre')
  assert.equal(state.deudaMensual.cuota.saldo, 1000)
})
