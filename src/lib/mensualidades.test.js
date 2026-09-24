import test from 'node:test'
import assert from 'node:assert/strict'
import { cuotasMensuales, generarCuotas, limitesMeses, mesAnterior } from './mensualidades.js'

const reserva = { checkin: '2028-01-15', checkout: '2028-04-01', plan_mensual: [] }
test('vencimientos al fin de mes y checkout exclusivo, sin prorratear el total', () => {
  assert.equal(limitesMeses(reserva).max, '2028-03')
  const plan = generarCuotas({ ...reserva, precio_total: 99 }, { desde: '2028-01', hasta: '2028-03', importe: '300.000,50', dia: '31' })
  assert.deepEqual(plan.map(c => c.vencimiento), ['2028-01-31', '2028-02-29', '2028-03-31'])
  assert.equal(plan[0].importe, 300000.5)
})
test('no reemplaza meses ya acordados, ni permite rangos fuera de estadía', () => {
  const previa = { mes: '2028-02-01', vencimiento: '2028-02-12', importe: 200 }
  const plan = generarCuotas({ ...reserva, plan_mensual: [previa] }, { desde: '2028-01', hasta: '2028-03', importe: '300', dia: '10' })
  assert.deepEqual(plan[1], previa)
  for (const fields of [{ hasta: '2028-04' }, { desde: '2028-03', hasta: '2028-02' }, { importe: '0' }, { dia: 32 }]) {
    assert.throws(() => generarCuotas(reserva, { desde: '2028-01', hasta: '2028-03', importe: '100', dia: 10, ...fields }))
  }
})
test('pendiente, parcial, pagado, anulado y exceso se calculan por mes', () => {
  const plan = generarCuotas(reserva, { desde: '2028-01', hasta: '2028-03', importe: '100', dia: 10 })
  const pagos = [
    { tipo: 'mensualidad', periodo_mes: '2028-01-01', monto: 30, confirmado: true },
    { tipo: 'mensualidad', periodo_mes: '2028-01-01', monto: 70, confirmado: false },
    { tipo: 'mensualidad', periodo_mes: '2028-02-01', monto: 120, confirmado: true },
    { tipo: 'total', monto: 100, confirmado: true },
  ]
  const cuotas = cuotasMensuales({ ...reserva, plan_mensual: plan }, pagos, '2028-03-10')
  assert.deepEqual(cuotas.map(c => c.estado), ['parcial', 'pagado', 'pendiente'])
  assert.deepEqual(cuotas.map(c => c.saldo), [70, 0, 100])
  assert.deepEqual(cuotas.map(c => c.vencida), [true, false, false])
})
test('mes anterior respeta el calendario y años bisiestos, no equivale a 30 días', () => {
  assert.equal(mesAnterior('2028-03-31'), '2028-02-29')
  assert.equal(mesAnterior('2027-03-31'), '2027-02-28')
  assert.equal(mesAnterior('2027-01-08'), '2026-12-08')
})
