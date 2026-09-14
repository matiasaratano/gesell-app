import test from 'node:test'
import assert from 'node:assert/strict'
import { datosPago, mensualidades, mensajeReserva, pendientesLimpieza } from './operacion-reserva.js'

test('mensualidad exige período; saldo no conserva un período anterior', () => {
  const pago = { tipo: 'mensualidad', monto: '350.000,50', fecha_recibido: '2027-01-10', metodo: 'transferencia', periodo_mes: '2027-01' }
  assert.equal(datosPago(pago,'id').monto,350000.5)
  assert.equal(datosPago(pago,'id').periodo_mes,'2027-01-01')
  assert.throws(()=>datosPago({...pago,periodo_mes:''},'id'))
  assert.equal(datosPago({...pago,tipo:'saldo'},'id').periodo_mes,null)
})
test('mensualidades separa meses y omite pagos anulados y señas', () => {
  assert.deepEqual(mensualidades([
    {tipo:'mensualidad',periodo_mes:'2027-01-01',monto:100,confirmado:true},
    {tipo:'mensualidad',periodo_mes:'2027-01-01',monto:50,confirmado:true},
    {tipo:'mensualidad',periodo_mes:'2027-02-01',monto:200,confirmado:true},
    {tipo:'mensualidad',periodo_mes:'2027-02-01',monto:999,confirmado:false},
    {tipo:'seña',periodo_mes:null,monto:999,confirmado:true},
  ]),[['2027-01',150],['2027-02',200]])
})
test('WhatsApp usa precio, pagos confirmados y no incluye notas internas', () => {
  const mensaje = mensajeReserva({clientes:{nombre:'Ana'},propiedades:{nombre:'Depto 1'},checkin:'2027-01-01',checkout:'2027-01-10',precio_total:1000,notas_internas:'Privado'},[{monto:300,confirmado:true},{monto:100,confirmado:false}])
  assert.ok(mensaje.includes('Ana'))
  assert.ok(mensaje.includes('01/01/2027'))
  assert.match(mensaje,/700/)
  assert.ok(!mensaje.includes('Privado'))
})
test('limpieza usa última salida de cada propiedad y cambia si cambia checkout', () => {
  const base={propiedad_id:'p1',estado:'finalizada'}
  assert.deepEqual(pendientesLimpieza([
    {...base,id:'old',checkout:'2027-01-01'},
    {...base,id:'latest',checkout:'2027-01-10',limpieza_completada_para:'2027-01-10'},
    {...base,id:'closed',estado:'cerrada',checkout:'2027-01-11'},
  ]),[])
  assert.equal(pendientesLimpieza([{...base,checkout:'2027-01-11',limpieza_completada_para:'2027-01-10'}]).length,1)
})
