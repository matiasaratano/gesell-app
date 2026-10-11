import test from 'node:test'
import assert from 'node:assert/strict'
import { coincidenciasCliente, confirmarClienteNuevo } from './clientes-duplicados.js'
const cliente={id:'c1',nombre:'Ana',apellido:'Prueba',dni:'12.345.678',email:'ana@example.com',whatsapp:'+54 11 1234-5678'}
test('detecta coincidencias exactas normalizadas y no compara campos vacios',()=>{
 assert.deepEqual(coincidenciasCliente({nombre:' ANA   Prueba ',dni:'12345678',email:'ANA@example.com ',whatsapp:'541112345678'},[cliente])[0].motivos,['nombre','DNI','email','teléfono'])
 assert.equal(coincidenciasCliente({nombre:'Ana'},[cliente]).length,0)
 assert.equal(coincidenciasCliente({nombre:'Otra'},[{nombre:'Distinta'}]).length,0)
 assert.equal(coincidenciasCliente(cliente,[cliente]).length,0)
})
test('cancelar no autoriza alta; confirmar permite excepcion; error de consulta bloquea alta',async()=>{
 const db={from:()=>({select(){return this},order(){return this},range:async()=>({data:[cliente],error:null})})}
 assert.equal(await confirmarClienteNuevo(db,{nombre:'Ana Prueba'},async()=>false),false)
 assert.equal(await confirmarClienteNuevo(db,{email:cliente.email},async()=>true),true)
 assert.equal(await confirmarClienteNuevo(db,{nombre:'Otra'},()=>{throw Error('No debe preguntar')}),true)
 const fail={from:()=>({select(){return this},order(){return this},range:async()=>({data:null,error:Error('red')})})}
 await assert.rejects(confirmarClienteNuevo(fail,{nombre:'Otra'},async()=>true),/verificar/)
})
