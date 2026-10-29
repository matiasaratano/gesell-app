import test from 'node:test'
import assert from 'node:assert/strict'
import { proximaAccion } from './proxima-accion.js'
const r = { id:'r1',cliente_id:'c1',estado:'pendiente',canal_origen:'directo',precio_total:1000,checkin:'2027-01-01',checkout:'2027-01-05' }
test('proxima accion prioriza datos y cobros sin confirmar una reserva por si sola', () => {
  assert.equal(proximaAccion({...r,cliente_id:null},[],[], '2026-12-01').boton,'Asignar cliente')
  assert.equal(proximaAccion({...r,precio_total:null},[],[], '2026-12-01').boton,'Completar precio')
  assert.equal(proximaAccion(r,[],[], '2026-12-01').accion,'cobrar')
  assert.equal(proximaAccion(r,[],[], '2026-12-01').tipo,undefined)
  assert.equal(proximaAccion({...r,detalle_enviado_el:'2026-11-01'},[],[], '2026-12-01').boton,'Registrar seña')
  assert.equal(proximaAccion(r,[{confirmado:true,monto:300}],[], '2026-12-01').accion,'editar')
  assert.equal(proximaAccion({...r,estado:'confirmada'},[{confirmado:true,monto:300}],[], '2026-12-01').tipo,'voucher')
  assert.equal(proximaAccion({...r,estado:'confirmada'},[{confirmado:true,monto:300}],[{tipo:'voucher',enviado_el:'2026-12-01'}], '2026-12-01'),null)
  for(const estado of ['cancelada','cerrada'])assert.equal(proximaAccion({...r,estado}),null)
})
