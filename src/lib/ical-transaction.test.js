import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarioEnMemoria, sincronizarIcal } from './ical-transaction.js'
import { reconciliarCierres, upsertIcalReservas } from './ical-sync.js'

const cierre = { id: '00000000-0000-0000-0000-000000000001', propiedad_id: 'p1',
  canal_origen: 'booking', estado: 'cerrada', cliente_id: null, precio_total: null,
  pagos: [], checkin: '2090-01-01', checkout: '2090-01-10' }

test('planning split closures does not mutate the original snapshot', async () => {
  const initial = [structuredClone(cierre)]
  const plan = calendarioEnMemoria(initial)
  const eventos = [{ start: '2090-01-01', end: '2090-01-04', summary: 'CLOSED' },
    { start: '2090-01-06', end: '2090-01-10', summary: 'CLOSED' }]
  assert.equal(await reconciliarCierres(plan, eventos, 'p1', 'booking'), 1)
  await upsertIcalReservas(plan, eventos, 'p1', 'booking')
  assert.deepEqual(initial, [cierre])
  assert.deepEqual(plan.rows.map(r => [r.checkin, r.checkout]),
    [['2090-01-01', '2090-01-04'], ['2090-01-06', '2090-01-10']])
  assert.ok(plan.operaciones.some(o => o.accion === 'insert'))
})

test('one RPC applies the entire plan; a missing migration never falls back to separate writes', async () => {
  const reads = calendarioEnMemoria([cierre])
  const calls = []
  const db = { from: reads.from, rpc: async (name, args) => {
    calls.push({ name, args })
    return { error: { code: 'PGRST202' } }
  } }
  await assert.rejects(sincronizarIcal(db, [], 'p1', 'booking'), /migración/)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'aplicar_sincronizacion_ical')
  assert.deepEqual(calls[0].args.p_esperado, [cierre])
  assert.equal(calls[0].args.p_operaciones[0].accion, 'delete')
  assert.deepEqual(reads.operaciones, [])
  assert.deepEqual(reads.rows, [cierre])
})

test('managed reservations and payments are retained in the optimistic snapshot', async () => {
  const managed = { ...cierre, cliente_id: 'client', pagos: [{ id: 'b', monto: 20 }, { id: 'a', monto: 10 }] }
  const reads = calendarioEnMemoria([managed])
  const db = { from: reads.from, rpc: async (_name, args) => {
    assert.deepEqual(args.p_operaciones, [])
    assert.deepEqual(args.p_esperado[0].pagos.map(p => p.id), ['a', 'b'])
    return { error: null }
  } }
  const result = await sincronizarIcal(db, [], 'p1', 'booking')
  assert.equal(result.reabiertas, 0)
})
