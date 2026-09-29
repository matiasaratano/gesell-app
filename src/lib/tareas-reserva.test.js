import test from 'node:test'
import assert from 'node:assert/strict'
import { tareasReservas } from './tareas-reserva.js'

const booking = { id: 'b1', checkin: '2027-01-10', checkout: '2027-01-20', estado: 'pendiente', canal_origen: 'booking', requiere_sena: true, pagos: [] }
test('Booking no presupone que se puede solicitar un anticipo', () => {
  const aviso = tareasReservas([booking], '2026-12-15')[0].avisos.find(a => a.id === 'sena')
  assert.equal(aviso.texto, 'Sin pagos registrados · verificar condiciones de cobro en Booking')
  assert.doesNotMatch(aviso.texto, /pedir seña/i)
  const manual = tareasReservas([{ ...booking, canal_origen: 'directo' }], '2026-12-15')[0]
  assert.equal(manual.avisos.find(a => a.id === 'sena').texto, 'Sin seña registrada')
})
test('un solo grupo por reserva y Booking futuro no exige seña ahora', () => {
  const [t] = tareasReservas([booking], '2026-09-24')
  assert.equal(t.grupo, 'pendientes')
  assert.equal(t.avisos.find(a => a.id === 'precio').desde, '2026-09-24')
  assert.equal(t.avisos.length, 4)
  assert.equal(t.avisos.find(a => a.id === 'sena').desde, '2026-12-10')
})
test('contacto a 30 días y seña a un mes son avisos independientes', () => {
  const [antes] = tareasReservas([booking], '2026-11-26')
  assert.equal(antes.grupo, 'pendientes')
  assert.equal(antes.avisos.find(a => a.id === 'contacto').desde, '2026-12-11')
  assert.ok(antes.avisos.find(a => a.id === 'sena').desde > '2026-11-26')
  const [contactado] = tareasReservas([{ ...booking, booking_contactado_el: '2026-11-26' }], '2026-12-10')
  assert.ok(!contactado.avisos.some(a => a.id === 'contacto'))
  assert.ok(contactado.avisos.some(a => a.id === 'sena'))
})
test('Booking con precio completo espera a los 30 días para contactar', () => {
  const r = { ...booking, cliente_id: 'c1', precio_total: 100, requiere_sena: false }
  assert.equal(tareasReservas([r], '2026-12-10')[0].grupo, 'futuras')
  assert.equal(tareasReservas([r], '2026-12-11')[0].grupo, 'pendientes')
})
test('posponer afecta al grupo completo y vence el día indicado', () => {
  const r = { ...booking, recordar_el: '2026-12-15' }
  assert.equal(tareasReservas([r], '2026-12-10')[0].grupo, 'pospuestas')
  assert.equal(tareasReservas([r], '2026-12-15')[0].grupo, 'pendientes')
})
test('mensual no requiere seña y deuda programada sobrevive al checkout', () => {
  const r = { ...booking, modalidad: 'mensual', cliente_id: 'c1', precio_total: 100, plan_mensual: [{ mes: '2027-01-01', importe: 100, vencimiento: '2027-01-10' }] }
  assert.ok(!tareasReservas([r], '2027-01-11')[0].avisos.some(a => a.id === 'sena'))
  const [t] = tareasReservas([{ ...r, estado: 'finalizada' }], '2027-02-01')
  assert.equal(t.avisos.length, 1)
  assert.equal(t.prioridad, 0)
  assert.match(t.avisos[0].enlace, /mes=2027-01/)
})
test('no inventa deudas históricas; excluye cierres, cancelaciones y meses pagados', () => {
  const r = { ...booking, modalidad: 'mensual', estado: 'finalizada' }
  assert.deepEqual(tareasReservas([r], '2027-02-01'), [])
  assert.deepEqual(tareasReservas([{ ...r, estado: 'cerrada' }, { ...r, estado: 'cancelada' }]), [])
  const pagada = { ...r, plan_mensual: [{ mes: '2027-01-01', importe: 100, vencimiento: '2027-01-10' }], pagos: [{ tipo: 'mensualidad', periodo_mes: '2027-01-01', monto: 100, confirmado: true }] }
  assert.deepEqual(tareasReservas([pagada], '2027-02-01'), [])
})
test('recibir seña elimina el pedido sin marcar al huésped como contactado', () => {
  const [t] = tareasReservas([{ ...booking, pagos: [{ monto: 100, confirmado: true }] }], '2026-12-15')
  assert.ok(!t.avisos.some(a => a.id === 'sena'))
  assert.ok(t.avisos.some(a => a.id === 'contacto'))
})
