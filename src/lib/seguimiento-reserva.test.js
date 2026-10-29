import test from 'node:test'
import assert from 'node:assert/strict'
import { seguimientoReserva } from './seguimiento-reserva.js'
import { proximaAccion } from './proxima-accion.js'
const r = { id:'r',estado:'pendiente',cliente_id:'c',precio_total:1000,modalidad:'temporal',canal_origen:'directo',checkin:'2027-01-01',checkout:'2027-01-05' }
test('el seguimiento distingue datos, envio manual, sena real y voucher', () => {
  const pasos=seguimientoReserva(r,[],[])
  assert.deepEqual(pasos.map(p=>p.completo),[true,false,false,false])
  assert.equal(pasos[3].habilitado,false)
  const enviada={...r,detalle_enviado_el:'2026-12-01T12:00:00Z'}
  assert.equal(seguimientoReserva(enviada,[],[])[1].completo,true)
  assert.equal(proximaAccion(enviada,[],[],'2026-12-01').accion,'cobrar')
  const pagada={...enviada,estado:'confirmada',voucher_enviado_el:'2026-12-02T12:00:00Z'}
  assert.deepEqual(seguimientoReserva(pagada,[{confirmado:true,monto:300}],[]).map(p=>p.completo),[true,true,true,true])
  assert.equal(proximaAccion(pagada,[{confirmado:true,monto:300}],[],'2026-12-01'),null)
})
test('mensajes guardados y pagos vigentes completan pasos; no impone sena a plataformas', () => {
  const mensajes=[{tipo:'detalle',enviado_el:'2026-12-01'},{tipo:'voucher',enviado_el:'2026-12-02'}]
  assert.equal(seguimientoReserva(r,[{confirmado:false,monto:300}],mensajes)[2].completo,false)
  for(const canal_origen of ['booking','airbnb']) {
    const pasos=seguimientoReserva({...r,canal_origen},[],[])
    assert.equal(pasos[1].opcional,true);assert.equal(pasos[2].abrir,false);assert.equal(pasos[3].opcional,true)
  }
  for(const estado of ['cancelada','cerrada'])assert.deepEqual(seguimientoReserva({...r,estado}),[])
})
