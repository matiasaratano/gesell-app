import test from 'node:test'
import assert from 'node:assert/strict'
import { detalleSolicitud, fichaSolicitud, voucherSolicitud, solicitudLista, solicitudesAccionables, vistaSolicitud, datosVoucherReserva } from './solicitudes.js'
test('archivadas usa salida vigente de la reserva sin reactivar ni alterar confirmaciones', () => {
  assert.equal(vistaSolicitud({estado:'confirmada',estado_reserva:'cancelada',salida_reserva:'2020-01-01'},'2026-10-29'),'cancelada')
  assert.equal(vistaSolicitud({estado:'eliminada',estado_reserva:'cancelada'},'2026-10-29'),'eliminada')
  assert.equal(vistaSolicitud({estado:'confirmada',salida_reserva:'2026-10-01'}, '2026-10-01'), 'archivada')
  assert.equal(vistaSolicitud({estado:'confirmada',checkout:'2026-09-01',salida_reserva:'2026-10-02'}, '2026-10-01'), 'confirmada')
  assert.equal(vistaSolicitud({estado:'confirmada'}, '2026-10-01'), 'confirmada')
  for (const estado of ['abierta','archivada','eliminada']) assert.equal(vistaSolicitud({estado,salida_reserva:'2026-09-01'},'2026-10-01'),estado)
})
const s = { datos_cliente:{nombre:'Ana'},precio_total:1000,checkin:'2027-01-01',checkout:'2027-01-05',adultos:2,menores:0 }
test('detalle y voucher compartidos por Mensajes y Solicitudes no agregan ,00', () => {
  const solicitud = {...s,precio_total:'100000.00'}
  const propiedad = {nombre:'Depto 1',alias_cbu:'maratano.mp'}
  const detalle = detalleSolicitud(solicitud,propiedad)
  const voucher = voucherSolicitud({...solicitud,estado:'confirmada',clientes:{nombre:'Ana'},propiedades:propiedad,pagos:[{confirmado:true,monto:'30000.00'}]})
  for (const texto of [detalle,voucher]) {
    assert.doesNotMatch(texto,/,00\b/)
    for (const importe of ['100.000','30.000','70.000']) assert.ok(texto.includes(importe))
  }
})
test('detalle breve comparte fechas, noches, personas y solo la cuenta del departamento',()=>{
  const texto=detalleSolicitud(s,{nombre:'Depto 2',direccion:'Calle 1',alias_cbu:'cuenta.depto2',restriccion_vehiculos:true})
  for(const fragmento of ['*Reserva Depto 2*','4 noches','2 personas','cuenta.depto2','comprobante','24 hs','1 al 5 de enero de 2027']) assert.ok(texto.includes(fragmento))
  assert.doesNotMatch(texto,/voucher/i)
  assert.ok(!texto.includes('maratano.mp'))
  assert.ok(!texto.includes('0000003100056995782339'))
  assert.ok(detalleSolicitud(s,{nombre:'Depto 1',alias_cbu:'maratano.mp'}).includes('0000003100056995782339'))
  const manual=detalleSolicitud({...s,datos_cliente:undefined,adultos:undefined},{nombre:'Depto 1'})
  assert.ok(!manual.includes('undefined'));assert.ok(!manual.includes('NaN'))
})
test('datos del titular son opcionales en el detalle y no se vuelven a pedir por defecto',()=>{
  const p={nombre:'Depto 1',alias_cbu:'mi.alias'}
  assert.doesNotMatch(detalleSolicitud(s,p),/Nombre y apellido:|DNI:/)
  const combinado=detalleSolicitud(s,p,{pedirDatos:true})
  for(const texto of ['mi.alias','comprobante','por favor pasame estos datos del titular:','*Titular*','Nombre y apellido:','DNI:','Teléfono:','Email:','Domicilio y localidad:','*Acompañantes (nombre, apellido y DNI)*'])assert.ok(combinado.includes(texto))
  assert.ok(combinado.endsWith('La reserva se confirma al verificar la seña.'))
  assert.doesNotMatch(combinado,/Podés enviarme estos datos junto con el comprobante de pago/)
  assert.doesNotMatch(combinado,/antes de transferir.*complet|completar.*antes de pagar/)
})
test('el detalle de solicitud pide 30% sin prometer fechas bloqueadas',()=>{
 const texto=detalleSolicitud(s,{nombre:'Depto 1',alias_cbu:'mi.alias'})
 assert.match(texto,/30%/);assert.match(texto,/300/);assert.match(texto,/700/)
 assert.match(texto,/dentro de las próximas 24 hs/);assert.match(texto,/mi.alias/)
 assert.doesNotMatch(texto,/SIN CONFIRMAR|no bloquea fechas|no garantiza disponibilidad/)
 assert.match(texto,/enviar el comprobante por acá y confirmamos la reserva/)
 assert.match(fichaSolicitud(s),/01\/01\/2027/)
})
test('voucher usa pagos vigentes y no confirma solicitudes sin pago',()=>{
 const r={...s,estado:'confirmada',clientes:{nombre:'Ana',apellido:'Prueba'},propiedades:{nombre:'Depto 1'},pagos:[{confirmado:true,monto:300},{confirmado:false,monto:500}]}
 const texto=voucherSolicitud(r)
 assert.match(texto,/Reserva confirmada/);assert.match(texto,/300/);assert.match(texto,/700/)
 assert.throws(()=>voucherSolicitud({...r,estado:'pendiente'}),/confirmada/)
 assert.throws(()=>voucherSolicitud({...r,pagos:[]}),/pago/)
})
test('la negrita no incluye espacios finales del nombre del departamento', () => {
 for (const nombre of ['Depto 2 ', 'Depto 3\n', ' Depto 2\t']) {
   assert.equal(detalleSolicitud(s,{nombre}).split('\n')[0], `*Reserva ${nombre.trim()}*`)
 }
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
