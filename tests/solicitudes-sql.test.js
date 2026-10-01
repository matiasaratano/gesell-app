import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
const owner='00000000-0000-0000-0000-000000000001', prop='00000000-0000-0000-0000-000000000002'
const sql=path=>readFileSync(new URL(path,import.meta.url),'utf8')
async function base(){
 const db=new PGlite()
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
 create table auth.users(id uuid primary key); insert into auth.users values('${owner}');
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 select set_config('test.uid','${owner}',false);
 create table propiedades(id uuid primary key,nombre text);insert into propiedades values('${prop}','Depto 1');
 create table clientes(id uuid primary key default gen_random_uuid(),nombre text,apellido text,dni text,email text,whatsapp text,ciudad text,domicilio text);
 create table reservas(id uuid primary key,propiedad_id uuid references propiedades,cliente_id uuid references clientes,canal_origen text,checkin date,checkout date,adultos integer,menores integer,mascotas boolean,precio_total numeric,estado text,notas_internas text);
 create table pagos(id uuid primary key,reserva_id uuid references reservas,tipo text,monto numeric check(monto>0),fecha_recibido date,metodo text,confirmado boolean,numero_recibo serial unique);`)
 await db.exec(sql('../supabase/migrations/20260914_operacion_reservas.sql'))
 await db.exec(sql('../supabase/migrations/20260930_solicitudes.sql'))
 await db.exec(sql('../supabase/migrations/20260930_solicitudes.sql'))
 const s=(await db.query(`insert into solicitudes(propiedad_id,datos_cliente,checkin,checkout,precio_total) values($1,'{"nombre":"Ana","domicilio":"Calle 1"}','2027-01-01','2027-01-05',1000) returning *`,[prop])).rows[0]
 return {db,s}
}
const pago={id:'00000000-0000-0000-0000-000000000099',tipo:'seña',monto:300,fecha_recibido:'2026-09-30',metodo:'transferencia'}
async function confirmar(db,s,p=pago){return (await db.query('select confirmar_solicitud($1,$2,$3) as id',[s.id,s.updated_at,JSON.stringify(p)])).rows[0].id}
test('solicitud no ocupa fechas; pago confirmado crea todo una sola vez',async()=>{
 const {db,s}=await base();try{
 await db.exec(`grant usage on schema auth to authenticated;grant select,insert,update on propiedades,clientes,reservas,pagos to authenticated;grant usage on all sequences in schema public to authenticated;set role authenticated;`)
 assert.equal((await db.query('select * from reservas')).rows.length,0)
 assert.equal(await confirmar(db,s),s.id);assert.equal(await confirmar(db,s),s.id)
 assert.equal((await db.query('select * from pagos')).rows.length,1)
 assert.equal((await db.query('select estado from reservas')).rows[0].estado,'confirmada')
 assert.equal((await db.query('select domicilio from clientes')).rows[0].domicilio,'Calle 1')
 }finally{await db.close()}
})

async function acceso(db) {
 await db.exec('grant select,insert,update,delete on propiedades,reservas,pagos to service_role;')
 await db.exec(sql('../supabase/migrations/20260926_transacciones_seguras.sql'))
 await db.exec(sql('../supabase/migrations/20260930_acceso_y_formulario.sql'))
 await db.exec(sql('../supabase/migrations/20260930_acceso_y_formulario.sql'))
 await db.exec(`insert into administradores values('${owner}');grant usage on schema auth to authenticated;`)
}
async function enlace(db,s) {
 await db.exec(`set role authenticated;select set_config('test.uid','${owner}',false)`)
 return (await db.query('select crear_enlace_solicitud($1) as token',[s.id])).rows[0].token
}
const datos={nombre:'Ana',apellido:'Prueba',dni:'12345678',whatsapp:'1123456789',email:'ana@example.com',domicilio:'Calle 1',ciudad:'Villa Gesell'}
test('confirmar sobre cierres conserva extremos, exige consentimiento y revierte todo ante error',async()=>{
 const {db,s}=await base();try{
  await acceso(db)
  await db.exec(sql('../supabase/migrations/20261001_solicitudes_sobre_cierres.sql'))
  await db.exec(sql('../supabase/migrations/20261001_solicitudes_sobre_cierres.sql'))
  const c=(await db.query(`insert into reservas(id,propiedad_id,canal_origen,estado,checkin,checkout) values(gen_random_uuid(),$1,'booking','cerrada','2026-12-20','2027-02-01') returning id,checkin::text,checkout::text,canal_origen`,[prop])).rows[0]
  const run=(cs=[c],p=pago)=>db.query('select confirmar_solicitud_sobre_cierres($1,$2,$3,$4) as id',[s.id,s.updated_at,JSON.stringify(p),JSON.stringify(cs)])
  await db.exec('set role anon')
  await assert.rejects(run(),/permission denied/)
  await db.exec('set role authenticated')
  await assert.rejects(confirmar(db,s),/ocupadas/)
  await assert.rejects(run([]),/autoriza/)
  await assert.rejects(run([{...c,checkout:'2027-01-30'}]),/cambiaron/)
  await assert.rejects(run([c],{...pago,monto:2000}),/pago/)
  assert.deepEqual((await db.query('select id,checkin::text,checkout::text,canal_origen from reservas')).rows,[c])
  assert.equal((await db.query('select * from clientes')).rows.length,0)
  await db.exec('reset role;create function falla_pago_cierre() returns trigger language plpgsql as $$begin raise exception \'pago fallido\';end$$;create trigger falla_pago_cierre before insert on pagos for each row execute function falla_pago_cierre();set role authenticated;')
  await assert.rejects(run(),/pago fallido/)
  assert.deepEqual((await db.query('select id,checkin::text,checkout::text,canal_origen from reservas')).rows,[c])
  await db.exec('reset role;drop trigger falla_pago_cierre on pagos;set role authenticated;')
  assert.equal((await run()).rows[0].id,s.id)
  assert.equal((await run()).rows[0].id,s.id)
  const rs=(await db.query('select estado,canal_origen,checkin::text,checkout::text from reservas order by checkin')).rows
  assert.deepEqual(rs.map(r=>[r.estado,r.canal_origen,r.checkin,r.checkout]),[
   ['cerrada','booking','2026-12-20','2027-01-01'],['confirmada','directo','2027-01-01','2027-01-05'],['cerrada','booking','2027-01-05','2027-02-01']])
  assert.equal((await db.query('select * from pagos')).rows.length,1)
 }finally{await db.close()}
})
test('cierres exactos, parciales y de ambas plataformas solo ceden las noches reservadas',async()=>{
 const {db,s}=await base();try{
  await acceso(db);await db.exec(sql('../supabase/migrations/20261001_solicitudes_sobre_cierres.sql'))
  for(const intervalos of [
   [['booking','2027-01-01','2027-01-05']],
   [['booking','2026-12-20','2027-01-03']],
   [['airbnb','2027-01-03','2027-01-10']],
   [['booking','2026-12-20','2027-01-03'],['airbnb','2027-01-03','2027-01-10']]
  ]) {
   await db.exec('begin')
   const cierres=[]
   for(const [canal,entrada,salida] of intervalos) cierres.push((await db.query(`insert into reservas(id,propiedad_id,canal_origen,estado,checkin,checkout) values(gen_random_uuid(),$1,$2,'cerrada',$3,$4) returning id,checkin::text,checkout::text,canal_origen`,[prop,canal,entrada,salida])).rows[0])
   await db.exec('set local role authenticated')
   await db.query('select confirmar_solicitud_sobre_cierres($1,$2,$3,$4)',[s.id,s.updated_at,JSON.stringify(pago),JSON.stringify(cierres.reverse())])
   const remanentes=(await db.query("select checkin::text,checkout::text from reservas where estado='cerrada' order by checkin")).rows
   const esperados=intervalos.flatMap(([,a,b])=>[...(a<'2027-01-01'?[{checkin:a,checkout:'2027-01-01'}]:[]),...(b>'2027-01-05'?[{checkin:'2027-01-05',checkout:b}]:[])])
   assert.deepEqual(remanentes,esperados)
   await db.exec('rollback')
  }
 }finally{await db.close()}
})
test('cierres con cliente, precio, pago o de origen manual nunca se reemplazan',async()=>{
 const {db,s}=await base();try{
  await acceso(db);await db.exec(sql('../supabase/migrations/20261001_solicitudes_sobre_cierres.sql'))
  const c=(await db.query(`insert into reservas(id,propiedad_id,canal_origen,estado,checkin,checkout) values(gen_random_uuid(),$1,'airbnb','cerrada','2027-01-01','2027-01-05') returning id,checkin,checkout,canal_origen`,[prop])).rows[0]
  const run=()=>db.query('select confirmar_solicitud_sobre_cierres($1,$2,$3,$4)',[s.id,s.updated_at,JSON.stringify(pago),JSON.stringify([c])])
  for (const cambio of ["estado='pendiente'","precio_total=100","canal_origen='directo'","cliente_id=(select id from clientes limit 1)"]) {
   await db.exec(`insert into clientes(nombre) values('Huesped');update reservas set ${cambio};`)
   await assert.rejects(run(),/ocupadas/)
   await db.exec("update reservas set estado='cerrada',precio_total=null,canal_origen='airbnb',cliente_id=null;")
  }
  await db.query(`insert into pagos(id,reserva_id,monto,confirmado) values(gen_random_uuid(),$1,10,false)`,[c.id])
  await assert.rejects(run(),/ocupadas/)
  assert.equal((await db.query('select * from reservas')).rows.length,1)
 }finally{await db.close()}
})
async function formularioGeneral(db) {
 await acceso(db)
 await db.exec(sql('../supabase/migrations/20260930_solicitudes_publicas.sql'))
 await db.exec(sql('../supabase/migrations/20260930_solicitudes_publicas.sql'))
 await db.exec('set role authenticated')
 return (await db.query('select obtener_formulario_general() as token')).rows[0].token
}
const estadia={checkin:'2090-01-01',checkout:'2090-01-05',adultos:2,menores:1}
test('enlace general reutilizable recibe solicitudes sin carga previa ni bloqueo, con reintentos idempotentes',async()=>{
 const {db}=await base();try{
 const token=await formularioGeneral(db)
 assert.equal((await db.query('select obtener_formulario_general() as token')).rows[0].token,token)
 await db.exec('set role anon')
 assert.equal((await db.query('select ver_formulario_general($1) as visible',[token])).rows[0].visible,true)
 await assert.rejects(db.query('select * from solicitud_formularios'),/permission denied/)
 await assert.rejects(db.query('select obtener_formulario_general()'),/permission denied/)
 const nonce=randomUUID()
 const enviar=(envio,payload=datos)=>db.query('select recibir_solicitud_publica($1,$2,$3,$4)',[token,envio,JSON.stringify(payload),JSON.stringify({...estadia,propiedad_id:prop,precio_total:1,estado:'confirmada',owner_id:randomUUID()})])
 await enviar(nonce);await enviar(nonce,{...datos,nombre:'No reemplazar'});await enviar(randomUUID(),{...datos,nombre:'Otro huesped'})
 await db.exec('reset role')
 const rows=(await db.query('select * from solicitudes where formulario_id is not null order by datos_cliente->>\'nombre\'')).rows
 assert.equal(rows.length,2);assert.equal(rows[0].datos_cliente.nombre,'Ana')
 assert.equal(rows[0].propiedad_id,null);assert.equal(rows[0].precio_total,null);assert.equal(rows[0].owner_id,owner)
 assert.equal(rows[0].estado,'abierta');assert.equal((await db.query('select * from reservas')).rows.length,0)
 assert.equal((await db.query('select * from clientes')).rows.length,0)
 assert.equal((await db.query('select * from pagos')).rows.length,0)
 await db.exec('set role authenticated')
 await assert.rejects(confirmar(db,rows[0]))
 const assigned=(await db.query('update solicitudes set propiedad_id=$1,precio_total=1000 where id=$2 returning *',[prop,rows[0].id])).rows[0]
 assert.equal((await db.query('select * from reservas')).rows.length,0)
 assert.equal(await confirmar(db,assigned),assigned.id)
 assert.equal((await db.query('select * from pagos')).rows.length,1)
 }finally{await db.close()}
})
test('formulario general valida fechas, contacto y limites; un enlace deshabilitado no admite envios',async()=>{
 const {db}=await base();try{
 const token=await formularioGeneral(db);await db.exec('set role anon')
 assert.equal((await db.query('select ver_formulario_general($1) as visible',['invalido'])).rows[0].visible,false)
 const enviar=(stay,personal=datos)=>db.query('select recibir_solicitud_publica($1,$2,$3,$4)',[token,randomUUID(),JSON.stringify(personal),JSON.stringify(stay)])
 for(const invalid of [{...estadia,checkout:estadia.checkin},{...estadia,checkin:'2020-01-01'}, {...estadia,adultos:0},{...estadia,menores:-1},{...estadia,checkin:'2090-02-30'}])await assert.rejects(enviar(invalid))
 await assert.rejects(enviar(estadia,{...datos,email:'no-es-email'}))
 await db.exec('reset role')
 assert.deepEqual((await db.query(sql('../supabase/setup/verificar_acceso_publico.sql'))).rows,[])
 await db.exec(`insert into solicitudes(owner_id,datos_cliente,checkin,checkout,formulario_id,envio_publico_id)
 select '${owner}','{}','2090-01-01','2090-01-02',f.id,gen_random_uuid() from solicitud_formularios f cross join generate_series(1,50);set role anon;`)
 await assert.rejects(enviar(estadia),/limite/)
 await db.exec('reset role;update solicitud_formularios set activo=false;set role anon')
 assert.equal((await db.query('select ver_formulario_general($1) as visible',[token])).rows[0].visible,false)
 await assert.rejects(enviar(estadia),/no disponible/)
 }finally{await db.close()}
})
test('eliminar una reserva conserva la solicitud en eliminadas y corrige las eliminaciones anteriores',async()=>{
 const {db,s}=await base();try{
 await acceso(db);await confirmar(db,s)
 await db.query('select eliminar_reserva_segura($1)',[s.id])
 assert.equal((await db.query('select estado from solicitudes where id=$1',[s.id])).rows[0].estado,'confirmada')
 const migration=sql('../supabase/migrations/20260930_solicitudes_reservas_eliminadas.sql')
 await db.exec(migration);await db.exec(migration)
 const historial=(await db.query('select * from solicitudes where id=$1',[s.id])).rows[0]
 assert.equal(historial.estado,'eliminada');assert.equal(historial.reserva_id,s.id)
 assert.deepEqual(historial.datos_cliente,s.datos_cliente)
 const nueva=(await db.query(`insert into solicitudes(propiedad_id,datos_cliente,checkin,checkout,precio_total)
 values($1,'{"nombre":"Nueva"}','2090-01-01','2090-01-05',1000) returning *`,[prop])).rows[0]
 await db.exec('set role authenticated')
 await confirmar(db,nueva,{...pago,id:randomUUID()})
 await assert.rejects(db.query("update solicitudes set estado='eliminada' where id=$1",[nueva.id]),/ya fue confirmada/)
 await db.query('select eliminar_reserva_segura($1)',[nueva.id])
 const eliminada=(await db.query('select * from solicitudes where id=$1',[nueva.id])).rows[0]
 assert.equal(eliminada.estado,'eliminada')
 assert.equal((await db.query('select * from pagos')).rows.length,0)
 await assert.rejects(confirmar(db,eliminada))
 await assert.rejects(db.query("update solicitudes set estado='abierta' where id=$1",[nueva.id]),/fue eliminada/)
 }finally{await db.close()}
})
test('si falla la eliminacion de la reserva, tampoco cambia el estado de la solicitud',async()=>{
 const {db,s}=await base();try{
 await acceso(db)
 await db.exec(sql('../supabase/migrations/20260930_solicitudes_reservas_eliminadas.sql'))
 await confirmar(db,s)
 await db.exec(`create function fallo_delete() returns trigger language plpgsql as $$begin raise exception 'fallo simulado';end$$;
 create trigger zzz_fallo_delete after delete on reservas for each row execute function fallo_delete();set role authenticated;`)
 await assert.rejects(db.query('select eliminar_reserva_segura($1)',[s.id]),/fallo simulado/)
 assert.equal((await db.query('select estado from solicitudes where id=$1',[s.id])).rows[0].estado,'confirmada')
 assert.equal((await db.query('select * from pagos')).rows.length,1)
 assert.equal((await db.query('select * from reservas')).rows.length,1)
 }finally{await db.close()}
})
test('formulario publico solo recibe datos, nunca ocupa noches; confirmacion administrativa conserva el flujo',async()=>{
 const {db,s}=await base();try{
 await acceso(db);const token=await enlace(db,s)
 await db.exec('set role anon')
 const info=(await db.query('select ver_formulario_solicitud($1) as info',[token])).rows[0].info
 assert.deepEqual(Object.keys(info).sort(),['adultos','alojamiento','checkin','checkout','menores'].sort())
 for(const tabla of ['reservas','clientes','pagos','propiedades','solicitudes','solicitud_enlaces','administradores','reserva_historial']) {
  await assert.rejects(db.query(`select * from ${tabla}`),/permission denied/)
 }
 await assert.rejects(confirmar(db,s),/permission denied/)
 await assert.rejects(db.query('select crear_enlace_solicitud($1)',[s.id]),/permission denied/)
 const payload={...datos,estado:'confirmada',reserva_id:s.id,precio_total:1,propiedad_id:'otro',owner_id:'otro'}
 await db.query('select enviar_formulario_solicitud($1,$2)',[token,JSON.stringify(payload)])
 await db.query('select enviar_formulario_solicitud($1,$2)',[token,JSON.stringify({...datos,nombre:'No sobrescribir'})])
 await assert.rejects(db.query('select ver_formulario_solicitud($1)',[token]),/no disponible/)
 await db.exec('reset role')
 const actual=(await db.query('select * from solicitudes')).rows[0]
 assert.deepEqual(actual.datos_cliente,datos);assert.equal(Number(actual.precio_total),1000);assert.equal(actual.estado,'abierta')
 assert.equal((await db.query('select * from reservas')).rows.length,0)
 assert.equal((await db.query('select * from clientes')).rows.length,0)
 await db.exec('set role authenticated')
 assert.equal(await confirmar(db,actual),s.id)
 assert.equal((await db.query('select * from pagos')).rows.length,1)
 }finally{await db.close()}
})
test('solo administradores habilitados acceden a tablas aunque existan politicas permisivas antiguas',async()=>{
 const {db,s}=await base();try{
 await db.exec('alter table reservas enable row level security;create policy antigua on reservas to public using(true) with check(true);grant all on reservas to anon,authenticated;')
 await acceso(db)
 await db.exec(`set role authenticated;select set_config('test.uid','00000000-0000-0000-0000-000000000003',false)`)
 assert.equal((await db.query('select es_administrador() as permitido')).rows[0].permitido,false)
 assert.equal((await db.query('select * from propiedades')).rows.length,0)
 assert.equal((await db.query('select * from solicitudes')).rows.length,0)
 await assert.rejects(db.query('select crear_enlace_solicitud($1)',[s.id]),/Sin acceso/)
 await assert.rejects(db.query("insert into clientes(nombre) values('intruso')"),/row-level security/)
 await assert.rejects(confirmar(db,s),/sin permisos/)
 await db.exec(`select set_config('test.uid','${owner}',false)`)
 assert.equal((await db.query('select es_administrador() as permitido')).rows[0].permitido,true)
 assert.equal((await db.query('select * from propiedades')).rows.length,1)
 await db.exec('reset role')
 assert.deepEqual((await db.query(sql('../supabase/setup/verificar_acceso_publico.sql'))).rows,[])
 await db.exec('set role service_role')
 await db.query("select aplicar_sincronizacion_ical($1,'booking','[]'::jsonb,'[]'::jsonb)",[prop])
 assert.equal((await db.query('select * from propiedades')).rows.length,1)
 }finally{await db.close()}
})
test('enlace vence, se reemplaza y no permite datos invalidos ni solicitudes archivadas',async()=>{
 const {db,s}=await base();try{
 await acceso(db);const viejo=await enlace(db,s),token=await enlace(db,s)
 await db.exec('set role anon')
 await assert.rejects(db.query('select ver_formulario_solicitud($1)',[viejo]),/no disponible/)
 await assert.rejects(db.query('select ver_formulario_solicitud($1)',['no-es-token']),/no disponible/)
 for(const payload of [{}, {...datos,email:'invalido'}, {...datos,nombre:'x'.repeat(151)}, {...datos,nombre:{valor:'Ana'}}]) {
  await assert.rejects(db.query('select enviar_formulario_solicitud($1,$2)',[token,JSON.stringify(payload)]))
 }
 await db.exec("reset role;update solicitud_enlaces set vence_at=now()-interval '1 day';set role anon;")
 await assert.rejects(db.query('select enviar_formulario_solicitud($1,$2)',[token,JSON.stringify(datos)]),/no disponible/)
 const nuevo=await enlace(db,s)
 await db.exec("reset role;update solicitudes set estado='archivada';set role anon")
 await assert.rejects(db.query('select enviar_formulario_solicitud($1,$2)',[nuevo,JSON.stringify(datos)]),/no disponible/)
 }finally{await db.close()}
})
test('conflictos y pago fallido no dejan cliente ni reserva a medias',async()=>{
 const {db,s}=await base();try{
 await assert.rejects(confirmar(db,s,{...pago,monto:0}),/pago/)
 await db.exec(`create function fail_pay() returns trigger language plpgsql as $$begin raise exception 'fallo pago';end$$; create trigger fail_pay before insert on pagos for each row execute function fail_pay();`)
 await assert.rejects(confirmar(db,s),/fallo pago/)
 assert.equal((await db.query('select * from reservas')).rows.length,0)
 assert.equal((await db.query('select * from clientes')).rows.length,0)
 await db.exec(`drop trigger fail_pay on pagos;insert into reservas(id,propiedad_id,checkin,checkout,estado) values(gen_random_uuid(),'${prop}','2027-01-03','2027-01-06','cerrada');`)
 await assert.rejects(confirmar(db,s),/ocupadas/)
 assert.equal((await db.query('select estado from solicitudes')).rows[0].estado,'abierta')
 }finally{await db.close()}
})
test('rechaza solicitudes archivadas o modificadas y visitantes no pueden leerlas',async()=>{
 const {db,s}=await base();try{
 await db.query('update solicitudes set precio_total=1200 where id=$1',[s.id]);await assert.rejects(confirmar(db,s),/cambio/)
 await db.query("update solicitudes set estado='archivada' where id=$1",[s.id]);await assert.rejects(confirmar(db,s),/archivada/)
 await db.exec('set role anon');await assert.rejects(db.query('select * from solicitudes'),/permission denied/)
 await db.exec(`reset role;grant usage on schema auth to authenticated;set role authenticated;select set_config('test.uid','00000000-0000-0000-0000-000000000003',false);`)
 assert.equal((await db.query('select * from solicitudes')).rows.length,0)
 }finally{await db.close()}
})
