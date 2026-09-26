import test from 'node:test'
import assert from 'node:assert/strict'
import { valorEnPeriodo, valoresPorCanal } from './reporte.js'
const reserva = { checkin: '2026-09-15', checkout: '2026-10-15', precio_total: '300000', estado: 'confirmada', canal_origen: 'directo' }
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
