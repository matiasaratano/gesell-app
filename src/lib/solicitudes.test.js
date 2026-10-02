import test from 'node:test'
import assert from 'node:assert/strict'
import { detalleSolicitud, fichaSolicitud, voucherSolicitud, solicitudLista, solicitudesAccionables, vistaSolicitud, datosVoucherReserva } from './solicitudes.js'
test('archivadas usa salida vigente de la reserva sin reactivar ni alterar confirmaciones', () => {
  assert.equal(vistaSolicitud({estado:'confirmada',salida_reserva:'2026-10-01'}, '2026-10-01'), 'archivada')
  assert.equal(vistaSolicitud({estado:'confirmada',checkout:'2026-09-01',salida_reserva:'2026-10-02'}, '2026-10-01'), 'confirmada')
  assert.equal(vistaSolicitud({estado:'confirmada'}, '2026-10-01'), 'confirmada')
  for (const estado of ['abierta','archivada','eliminada']) assert.equal(vistaSolicitud({estado,salida_reserva:'2026-09-01'},'2026-10-01'),estado)
})
const s = { datos_cliente:{nombre:'Ana'},precio_total:1000,checkin:'2027-01-01',checkout:'2027-01-05',adultos:2,menores:0 }
test('detalle compartido agrega horarios, noches, condiciones y solo la cuenta del departamento',()=>{
  const texto=detalleSolicitud(s,{nombre:'Depto 2',direccion:'Calle 1',alias_cbu:'cuenta.depto2',restriccion_vehiculos:true})
  for(const fragmento of ['14:00','10:00','Duración: 4 noches','Dirección: Calle 1','cuenta.depto2','comprobante','ropa blanca','vehículos','24 hs','━━━━━━━━━━━━━━━━━━━━━━━━━━━','Check-in: 1 de enero de 2027','DETALLES DE LA RESERVA','MÉTODO DE PAGO','POLÍTICAS Y CONDICIONES']) assert.ok(texto.includes(fragmento))
  assert.doesNotMatch(texto,/voucher/i)
  assert.ok(!texto.includes('maratano.mp'))
  assert.ok(!texto.includes('0000003100056995782339'))
  assert.ok(detalleSolicitud(s,{nombre:'Depto 1',alias_cbu:'maratano.mp'}).includes('0000003100056995782339'))
  const manual=detalleSolicitud({...s,datos_cliente:undefined,adultos:undefined},{nombre:'Depto 1'})
  assert.ok(!manual.includes('undefined'));assert.ok(!manual.includes('NaN'))
})
test('el detalle de solicitud pide 30% sin prometer fechas bloqueadas',()=>{
 const texto=detalleSolicitud(s,{nombre:'Depto 1',alias_cbu:'mi.alias'})
 assert.match(texto,/30%/);assert.match(texto,/300/);assert.match(texto,/700/)
 assert.match(texto,/seña dentro de las 24 hs/);assert.match(texto,/mi.alias/)
 assert.doesNotMatch(texto,/SIN CONFIRMAR|no bloquea fechas|no garantiza disponibilidad/)
 assert.match(texto,/envianos el comprobante para confirmar la reserva/)
 assert.match(fichaSolicitud(s),/01\/01\/2027/)
})
test('voucher usa pagos vigentes y no confirma solicitudes sin pago',()=>{
 const r={...s,estado:'confirmada',clientes:{nombre:'Ana',apellido:'Prueba'},propiedades:{nombre:'Depto 1'},pagos:[{confirmado:true,monto:300},{confirmado:false,monto:500}]}
 const texto=voucherSolicitud(r)
 assert.match(texto,/CONFIRMACIÓN/);assert.match(texto,/300/);assert.match(texto,/700/)
 assert.throws(()=>voucherSolicitud({...r,estado:'pendiente'}),/confirmada/)
 assert.throws(()=>voucherSolicitud({...r,pagos:[]}),/pago/)
})
test('precarga de voucher usa titular, fechas y solo pagos confirmados sin autorizar automaticamente',()=>{
  const data=datosVoucherReserva({clientes:{nombre:'Ana',apellido:'Prueba'},checkin:'2027-01-01',checkout:'2027-01-05',adultos:2,menores:1,precio_total:1000,pagos:[{confirmado:true,monto:'300.25'},{confirmado:false,monto:500},{confirmado:true,monto:'20.50'}]})
  assert.deepEqual(data,{titular:'Ana Prueba',checkin:'2027-01-01',checkout:'2027-01-05',adultos:'2',menores:'1',total:'1000',pagado:'320.75',verificado:false})
  assert.equal(datosVoucherReserva({}).total,'')
  assert.equal(datosVoucherReserva({}).pagado,'0')
  assert.equal(datosVoucherReserva({estado:'confirmada',pagos:[{confirmado:true,monto:100}]}).verificado,true)
  assert.equal(datosVoucherReserva({estado:'confirmada',pagos:[{confirmado:false,monto:100}]}).verificado,false)
})
test('una consulta sin departamento y precio no puede preparar una seña',()=>{
 assert.equal(solicitudLista({propiedad_id:null,precio_total:null}),false)
 assert.equal(solicitudLista({propiedad_id:'p1',precio_total:null}),false)
 assert.equal(solicitudLista({propiedad_id:'p1',precio_total:1000}),true)
 assert.throws(()=>detalleSolicitud({...s,precio_total:null},{nombre:'Depto 1'}),/Asigná/)
})
test('inicio muestra solo abiertas, ordenadas por ingreso, sin perder las que aun no tienen departamento',()=>{
 const rows=[
  {id:'b',estado:'abierta',checkin:'2027-02-01',propiedad_id:'p1'},
  {id:'a',estado:'abierta',checkin:'2027-01-01',propiedad_id:null},
  {id:'c',estado:'abierta',checkin:'2027-01-02',propiedad_id:'p2'},
  ...['confirmada','archivada','eliminada'].map((estado,i)=>({id:`x${i}`,estado,checkin:'2027-01-01',propiedad_id:'p1'})),
 ]
 assert.deepEqual(solicitudesAccionables(rows,'p1').map(s=>s.id),['a','b'])
 assert.deepEqual(solicitudesAccionables(rows).map(s=>s.id),['a','c','b'])
 assert.equal(rows[0].id,'b')
})
