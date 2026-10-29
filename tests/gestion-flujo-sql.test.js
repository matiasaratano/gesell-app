import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
const owner='00000000-0000-0000-0000-000000000001', prop='00000000-0000-0000-0000-000000000002'
const sql=name=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8')
async function fixture() {
  const db=new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create table auth.users(id uuid primary key);insert into auth.users values('${owner}');
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function es_administrador() returns boolean language sql as $$select auth.uid()='${owner}'::uuid$$;
    select set_config('test.uid','${owner}',false);
    create table propiedades(id uuid primary key,nombre text,alias_cbu text,direccion text);
    insert into propiedades values('${prop}','Depto 1','prueba','Calle 1');
    create table clientes(id uuid primary key default gen_random_uuid(),nombre text,apellido text,dni text,email text,whatsapp text,ciudad text,domicilio text,notas text,vehiculo_patente text,es_repetidor boolean default false);
    create table reservas(id uuid primary key,propiedad_id uuid references propiedades,cliente_id uuid references clientes,canal_origen text,checkin date,checkout date,adultos integer,menores integer,mascotas boolean,precio_total numeric,estado text,notas_internas text);
    create table pagos(id uuid primary key,reserva_id uuid references reservas,tipo text,monto numeric,fecha_recibido date,metodo text,confirmado boolean);`)
  await db.exec(sql('20260914_operacion_reservas'))
  await db.exec(sql('20260930_solicitudes'))
  await db.exec(sql('20260930_solicitudes_reservas_eliminadas'))
  await db.exec(sql('20261028_flujo_gestion'));await db.exec(sql('20261028_flujo_gestion'))
  await db.exec(sql('20261028_seguimiento_reserva'));await db.exec(sql('20261028_seguimiento_reserva'))
  await db.exec('grant usage on schema auth to authenticated;grant select,insert,update,delete on propiedades,clientes,reservas,pagos,solicitudes to authenticated;set role authenticated;')
  const [a,b]=(await db.query("insert into clientes(nombre,dni,domicilio) values('Ana','123','Calle original'),('Ana','123',null) returning *")).rows
  const id=randomUUID(),payment=randomUUID()
  await db.query("insert into reservas(id,propiedad_id,cliente_id,checkin,checkout,estado,precio_total,canal_origen) values($1,$2,$3,'2027-01-01','2027-01-05','confirmada',1000,'directo')",[id,prop,a.id])
  await db.query("insert into pagos(id,reserva_id,tipo,monto,fecha_recibido,confirmado) values($1,$2,'seña',300,'2026-10-28',true)",[payment,id])
  return {db,a,b,id,payment}
}
const merge=(db,a,b,datos={...b,domicilio:a.domicilio})=>db.query('select unificar_clientes($1,$2,$3,$4)',[a.id,b.id,JSON.stringify({origen:a,destino:b}),JSON.stringify(datos)])
test('sena y confirmacion son atomicas sin checkbox y otros pagos no confirman solos',async()=>{
  const {db,id}=await fixture();try {
    await db.query("update reservas set estado='pendiente' where id=$1",[id])
    const p={id:randomUUID(),tipo:'seña',monto:-1,fecha_recibido:'2026-10-28',metodo:'transferencia'}
    await assert.rejects(db.query('select registrar_cobro($1,$2,false)',[id,JSON.stringify(p)]),/Importe/)
    assert.equal((await db.query('select estado from reservas where id=$1',[id])).rows[0].estado,'pendiente')
    await db.query('select registrar_cobro($1,$2,false)',[id,JSON.stringify({...p,id:randomUUID(),tipo:'saldo',monto:100})])
    assert.equal((await db.query('select estado from reservas where id=$1',[id])).rows[0].estado,'pendiente')
    await db.query('select registrar_cobro($1,$2,false)',[id,JSON.stringify({...p,monto:300})])
    await db.query('select registrar_cobro($1,$2,false)',[id,JSON.stringify({...p,monto:300})])
    assert.equal((await db.query('select estado from reservas where id=$1',[id])).rows[0].estado,'confirmada')
    assert.equal((await db.query('select count(*)::int n from pagos where id=$1',[p.id])).rows[0].n,1)
    await db.query('update pagos set confirmado=false where id=$1',[p.id])
    assert.equal((await db.query('select estado from reservas where id=$1',[id])).rows[0].estado,'confirmada')
  } finally { await db.close() }
})
test('cancelar conserva pagos y datos; eliminar con pagos se rechaza',async()=>{
  const {db,id,payment}=await fixture();try {
    await assert.rejects(db.query('select eliminar_reserva_segura($1)',[id]),/tiene pagos/)
    await assert.rejects(db.query('select cancelar_reserva($1,$2)',[id,' ']),/motivo/)
    await db.query('select cancelar_reserva($1,$2)',[id,'Cambio de planes'])
    await db.query('select cancelar_reserva($1,$2)',[id,'Reintento'])
    const r=(await db.query('select estado,cancelacion_motivo from reservas where id=$1',[id])).rows[0]
    assert.deepEqual(r,{estado:'cancelada',cancelacion_motivo:'Cambio de planes'})
    assert.equal((await db.query('select id from pagos')).rows[0].id,payment)
    assert.equal((await db.query("select count(*)::int n from reserva_historial where tabla='pagos' and accion='DELETE'")).rows[0].n,0)
  } finally { await db.close() }
})
test('unificar conserva reservas, pagos y solicitudes confirmadas sin cambiar sus datos historicos',async()=>{
  const {db,a,b,id,payment}=await fixture();try {
    await db.query("insert into solicitudes(propiedad_id,cliente_id,datos_cliente,checkin,checkout,precio_total,estado,reserva_id) values($1,$2,'{\"nombre\":\"Ana original\"}','2027-01-01','2027-01-05',1000,'confirmada',$3)",[prop,a.id,id])
    await merge(db,a,b)
    assert.equal((await db.query('select cliente_id from reservas')).rows[0].cliente_id,b.id)
    const s=(await db.query('select cliente_id,datos_cliente from solicitudes')).rows[0]
    assert.equal(s.cliente_id,b.id);assert.equal(s.datos_cliente.nombre,'Ana original')
    assert.equal((await db.query('select domicilio from clientes')).rows[0].domicilio,a.domicilio)
    assert.equal((await db.query('select id,reserva_id from pagos')).rows[0].id,payment)
    assert.equal((await db.query('select count(*)::int n from cliente_unificaciones')).rows[0].n,1)
  } finally { await db.close() }
})
test('unificar rechaza comparaciones desactualizadas y revierte todo ante otra referencia',async()=>{
  const {db,a,b}=await fixture();try {
    await db.query('update clientes set email=$1 where id=$2',['nuevo@example.com',a.id])
    await assert.rejects(merge(db,a,b),/cambiaron/)
    const actual=(await db.query('select * from clientes where id=$1',[a.id])).rows[0]
    await db.exec('reset role;create table otra_referencia(cliente_id uuid references clientes);grant select on otra_referencia to authenticated;')
    await db.query('insert into otra_referencia values($1)',[a.id]);await db.exec('set role authenticated')
    await assert.rejects(merge(db,actual,b),/foreign key/)
    assert.equal((await db.query('select count(*)::int n from clientes')).rows[0].n,2)
    assert.equal((await db.query('select cliente_id from reservas')).rows[0].cliente_id,a.id)
    assert.equal((await db.query('select count(*)::int n from cliente_unificaciones')).rows[0].n,0)
  } finally { await db.close() }
})
test('el alta transaccional guarda domicilio y un reintento no duplica al cliente',async()=>{
  const {db}=await fixture();try {
    const r={id:randomUUID(),propiedad_id:prop,estado:'pendiente',canal_origen:'directo',checkin:'2027-02-01',checkout:'2027-02-05',precio_total:500}
    for(let i=0;i<2;i++) await db.query('select crear_reserva_con_pago($1,$2,null)',[JSON.stringify(r),JSON.stringify({nombre:'Cliente IA',domicilio:'Calle extraída 123'})])
    assert.deepEqual((await db.query("select domicilio from clientes where nombre='Cliente IA'")).rows,[{domicilio:'Calle extraída 123'}])
  } finally { await db.close() }
})
test('guardar mensajes exige datos actuales, es idempotente y conserva versiones inmutables',async()=>{
  const {db,id}=await fixture();try {
    const datos=(await db.query(`select jsonb_build_object('reserva',to_jsonb(r),'cliente',(select to_jsonb(c) from clientes c where id=r.cliente_id),'propiedad',(select to_jsonb(p) from propiedades p where id=r.propiedad_id),'pagos',(select jsonb_agg(to_jsonb(p) order by id) from pagos p where reserva_id=r.id)) datos from reservas r where id=$1`,[id])).rows[0].datos
    const mid=randomUUID(),run=(snapshot=datos)=>db.query('select guardar_mensaje_reserva($1,$2,$3,$4,$5)',[mid,id,'voucher','Reserva confirmada',JSON.stringify(snapshot)])
    await run();await run()
    assert.equal((await db.query('select count(*)::int n from reserva_mensajes')).rows[0].n,1)
    await assert.rejects(db.query("update reserva_mensajes set texto='Otro texto' where id=$1",[mid]),/no se puede editar/)
    await db.query('update reserva_mensajes set enviado_el=now() where id=$1',[mid])
    await db.query('update reservas set precio_total=1200 where id=$1',[id])
    await assert.rejects(run(),/datos cambiaron/)
    assert.equal((await db.query('select datos from reserva_mensajes')).rows[0].datos.reserva.precio_total,1000)
  } finally { await db.close() }
})
test('cupo IA persistente limita a 30 y rechaza cuentas sin permiso',async()=>{
  const {db}=await fixture();try {
    for(let i=0;i<30;i++)assert.equal((await db.query('select consumir_cupo_ia() ok')).rows[0].ok,true)
    assert.equal((await db.query('select consumir_cupo_ia() ok')).rows[0].ok,false)
    await assert.rejects(db.query('select * from ia_cupos'),/permission denied/)
    await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000099',false)")
    await assert.rejects(db.query('select consumir_cupo_ia()'),/Sin acceso/)
    await assert.rejects(db.query("select cancelar_reserva($1,'No autorizado')",[randomUUID()]),/Sin acceso/)
  } finally { await db.close() }
})
