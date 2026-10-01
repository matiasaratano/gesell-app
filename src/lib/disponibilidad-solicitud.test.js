import test from 'node:test'
import assert from 'node:assert/strict'
import { cierreImportadoDisponible, consentimientoCierres } from './disponibilidad-solicitud.js'
const cierre = {id:'c1',estado:'cerrada',canal_origen:'booking',cliente_id:null,precio_total:null,pagos:[],checkin:'2027-01-01',checkout:'2027-02-01'}
test('solo un cierre importado sin gestion puede ser autorizado',()=>{
  assert.equal(cierreImportadoDisponible(cierre),true)
  assert.equal(cierreImportadoDisponible({...cierre,canal_origen:'airbnb'}),true)
  for (const cambio of [{estado:'pendiente'},{estado:'confirmada'},{canal_origen:'directo'},{cliente_id:'c'},{precio_total:1},{pagos:[{id:'p'}]},{pagos:undefined}]) assert.equal(cierreImportadoDisponible({...cierre,...cambio}),false)
  assert.deepEqual(consentimientoCierres([cierre]),[{id:'c1',canal_origen:'booking',checkin:'2027-01-01',checkout:'2027-02-01'}])
})
