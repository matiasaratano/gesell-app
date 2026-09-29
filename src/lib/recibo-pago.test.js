import test from 'node:test'
import assert from 'node:assert/strict'
import { datosReciboPago } from './recibo-pago.js'

const reserva = { id: 'r1', cliente_id: 'c1', checkin: '2027-01-01', checkout: '2027-01-10',
  clientes: { nombre: 'Ana', apellido: 'Prueba', dni: '12345', domicilio: 'Calle 123', ciudad: 'Buenos Aires' },
  propiedades: { nombre: 'Depto 1', direccion: 'Avenida 456' } }
const pago = { id: 'pago1', numero_recibo: 12, reserva_id: 'r1', monto: 25000.50, fecha_recibido: '2026-12-01', tipo: 'seña', metodo: 'transferencia', confirmado: true }
test('receipt comes from the actual payment, preserves cents and does not require email or phone', () => {
  const { datos, faltantes } = datosReciboPago(reserva, pago)
  assert.deepEqual(faltantes, [])
  assert.equal(datos.monto, 25000.50)
  assert.equal(datos.nro, 'REC-2026-0012')
  assert.equal(datos.concepto, 'reserva')
})
test('el año del recibo corresponde al cobro, no al día de consulta', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2028-01-01T12:00:00Z') })
  assert.equal(datosReciboPago(reserva, pago).datos.nro, 'REC-2026-0012')
  assert.equal(datosReciboPago(reserva, { ...pago, fecha_recibido: '2027-01-01', numero_recibo: 12345 }).datos.nro, 'REC-2027-12345')
})
test('missing guest, property and payment fields block emission', () => {
  const { faltantes } = datosReciboPago({ ...reserva, clientes: {}, propiedades: {} }, { ...pago, fecha_recibido: '', metodo: '' })
  for (const field of ['Nombre del cliente', 'DNI del cliente', 'Domicilio del cliente', 'Localidad del cliente', 'Dirección del alojamiento', 'Fecha del cobro', 'Medio de pago']) assert.ok(faltantes.includes(field))
})
test('annulled, unrelated, nonpositive and invalid-date payments cannot generate a receipt', () => {
  for (const change of [{ confirmado: false }, { reserva_id: 'r2' }, { monto: 0 }, { monto: 'bad' }, { fecha_recibido: '2027-02-30' }]) {
    assert.ok(datosReciboPago(reserva, { ...pago, ...change }).faltantes.length)
  }
})
test('monthly receipts include the paid month and require it', () => {
  assert.ok(datosReciboPago(reserva, { ...pago, tipo: 'mensualidad' }).faltantes.includes('Mes abonado'))
  const result = datosReciboPago(reserva, { ...pago, tipo: 'mensualidad', periodo_mes: '2027-01-01' })
  assert.deepEqual(result.faltantes, [])
  assert.equal(result.datos.periodo, '2027-01')
})
