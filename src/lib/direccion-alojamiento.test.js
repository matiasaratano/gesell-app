import test from 'node:test'
import assert from 'node:assert/strict'
import { direccionAlojamiento } from './direccion-alojamiento.js'
import { detalleSolicitud, voucherSolicitud } from './solicitudes.js'
test('direccion corregida solo para el alojamiento Alameda 206 y 308',()=>{
 const p={nombre:'Depto 2',direccion:'Alameda 206 y 308, Barrio Norte, Villa Gesell'}
 const correcta='Alameda 206 837, entre calle 308 y 309, Barrio Norte, Villa Gesell'
 assert.equal(direccionAlojamiento(p),correcta)
 assert.equal(direccionAlojamiento({direccion:'San Bernardo, Calle 123'}),'San Bernardo, Calle 123')
 assert.equal(direccionAlojamiento(), '')
 const s={precio_total:1000,checkin:'2027-01-01',checkout:'2027-01-05'}
 assert.ok(detalleSolicitud(s,p).includes(correcta))
 assert.ok(voucherSolicitud({...s,estado:'confirmada',propiedades:p,pagos:[{confirmado:true,monto:300}]}).includes(correcta))
})
