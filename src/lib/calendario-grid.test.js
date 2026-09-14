import test from 'node:test'
import assert from 'node:assert/strict'
import { celdasMes, reservaDesdeCierre } from './calendario-grid.js'
import { protegida } from './ical-sync.js'

test('diciembre incluye reservas que empiezan en enero en la grilla de 42 días', () => {
  const celdas = celdasMes(2026, 11)
  assert.equal(celdas.length, 42)
  assert.equal(celdas[0].ds, '2026-11-29')
  assert.equal(celdas.at(-1).ds, '2027-01-09')
  assert.deepEqual(celdas.find(c => c.ds === '2027-01-02'), { ds: '2027-01-02', actual: false, dia: 2 })
  assert.equal(celdas.filter(c => c.actual).length, 31)
})
test('enero y febrero bisiesto conservan fechas válidas', () => {
  for (const [y,m,dias] of [[2027,0,31], [2028,1,29]]) {
    const celdas = celdasMes(y,m)
    assert.equal(new Set(celdas.map(c=>c.ds)).size,42)
    assert.equal(celdas.filter(c=>c.actual).length,dias)
    for(let i=1;i<celdas.length;i++) assert.equal(Date.parse(celdas[i].ds)-Date.parse(celdas[i-1].ds),86400000)
  }
})
test('asignar inquilino prepara la misma reserva manual, protegida del sync', () => {
  const cierre = { id: 'r1', estado: 'cerrada', canal_origen: 'booking', checkin: '2027-01-02', checkout: '2027-01-05', propiedad_id: 'p1' }
  const reserva = reservaDesdeCierre(cierre)
  assert.equal(reserva.id,cierre.id)
  assert.equal(reserva.checkin,cierre.checkin)
  assert.equal(reserva.checkout,cierre.checkout)
  assert.equal(reserva.estado,'confirmada')
  assert.equal(reserva.canal_origen,'directo')
  assert.ok(protegida(reserva,'booking'))
  assert.equal(cierre.estado,'cerrada')
})
test('el enlace de conversión no modifica una reserva que ya no está cerrada', () => {
  const reserva = { id:'r1',estado:'pendiente',canal_origen:'booking' }
  assert.deepEqual(reservaDesdeCierre(reserva),reserva)
})
