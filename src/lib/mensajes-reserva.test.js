import test from 'node:test'
import assert from 'node:assert/strict'
import { snapshotMensaje, textoMensajeReserva } from './mensajes-reserva.js'
const r = { id:'r1',estado:'confirmada',precio_total:1000,checkin:'2027-01-01',checkout:'2027-01-05',adultos:2,menores:0,clientes:{nombre:'Ana'},propiedades:{nombre:'Depto 1',alias_cbu:'prueba'},pagos:[{id:'p2',confirmado:false,monto:100},{id:'p1',confirmado:true,monto:300}] }
test('mensajes vinculados usan pagos vigentes y conservan los datos originales', () => {
  assert.match(textoMensajeReserva(r,'detalle'),/700/)
  assert.match(textoMensajeReserva(r,'voucher'),/300/)
  assert.deepEqual(snapshotMensaje(r).pagos.map(p=>p.id),['p1','p2'])
  assert.equal(r.pagos[0].id,'p2')
  assert.throws(()=>textoMensajeReserva({...r,estado:'cancelada'},'voucher'))
  assert.throws(()=>textoMensajeReserva({...r,estado:'pendiente'},'voucher'))
})
