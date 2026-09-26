import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { sincronizarIcal } from '../src/lib/ical-transaction.js'

const propiedad = '00000000-0000-0000-0000-000000000001'
const reserva = '00000000-0000-0000-0000-000000000002'
const payment = '00000000-0000-0000-0000-000000000003'

async function database() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table propiedades(id uuid primary key);
    create table reservas(id uuid primary key, propiedad_id uuid references propiedades,
      canal_origen text, estado text, cliente_id uuid, precio_total numeric,
      checkin date not null, checkout date not null check(checkout > checkin),
      noches integer generated always as (checkout-checkin) stored, notas_internas text);
    create table pagos(id uuid primary key, reserva_id uuid references reservas, monto numeric);
    insert into propiedades values('${propiedad}');
    insert into reservas(id,propiedad_id,canal_origen,estado,checkin,checkout)
      values('${reserva}','${propiedad}','booking','cerrada','2090-01-01','2090-01-10');
  `)
  const sql = readFileSync(new URL('../supabase/migrations/20260926_transacciones_seguras.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  return db
}

async function snapshot(db) {
  return (await db.query(`select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('pagos',
    (select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb) from pagos p where p.reserva_id=r.id))
    order by r.id),'[]'::jsonb) as rows from reservas r where propiedad_id=$1`, [propiedad])).rows[0].rows
}

async function apply(db, expected, operations) {
  await db.query('select aplicar_sincronizacion_ical($1,$2,$3,$4)',
    [propiedad, 'booking', JSON.stringify(expected), JSON.stringify(operations)])
}
const remove = { accion: 'delete', id: reserva, datos: {} }

test('reservation deletion rolls payments back if the parent deletion fails', async () => {
  const db = await database()
  try {
    await db.exec(`insert into pagos values('${payment}','${reserva}',123.45);
      create function fail_delete() returns trigger language plpgsql as $$begin raise exception 'forced failure'; end;$$;
      create trigger failure before delete on reservas for each row execute function fail_delete();`)
    const before = await snapshot(db)
    await assert.rejects(db.query('select eliminar_reserva_segura($1)', [reserva]), /forced failure/)
    assert.deepEqual(await snapshot(db), before)
    await db.exec('drop trigger failure on reservas')
    await db.query('select eliminar_reserva_segura($1)', [reserva])
    assert.deepEqual(await snapshot(db), [])
    assert.equal((await db.query('select count(*)::int as n from pagos')).rows[0].n, 0)
  } finally { await db.close() }
})

test('a failed iCal replacement rolls back its preceding deletion', async () => {
  const db = await database()
  try {
    const before = await snapshot(db)
    await assert.rejects(apply(db, before, [remove, { accion: 'insert', id: reserva, datos: {
      propiedad_id: propiedad, canal_origen: 'booking', estado: 'cerrada', checkin: '2090-01-10', checkout: '2090-01-09',
    } }]), /invalidos/)
    assert.deepEqual(await snapshot(db), before)
  } finally { await db.close() }
})

test('concurrent payments/edits and direct attempts to delete managed reservations are rejected', async () => {
  const db = await database()
  try {
    const before = await snapshot(db)
    await db.exec(`insert into pagos values('${payment}','${reserva}',100)`)
    await assert.rejects(apply(db, before, [remove]), /cambiaron/)
    const paid = await snapshot(db)
    await assert.rejects(apply(db, paid, [remove]), /gestionada/)
    assert.deepEqual(await snapshot(db), paid)
  } finally { await db.close() }
})

test('database insert failure also restores a previously shortened closure', async () => {
  const db = await database()
  try {
    const before = await snapshot(db)
    await assert.rejects(apply(db, before, [
      { accion: 'update', id: reserva, datos: { checkout: '2090-01-04' } },
      { accion: 'insert', id: reserva, datos: { propiedad_id: propiedad,
        canal_origen: 'booking', estado: 'cerrada', checkin: '2090-01-06', checkout: '2090-01-10' } },
    ]), /duplicate key/)
    assert.deepEqual(await snapshot(db), before)
  } finally { await db.close() }
})

test('full planner + SQL supports partial reopening, generated nights and repeated imports', async () => {
  const db = await database()
  try {
    const api = { rpc: async (name, args) => {
      assert.equal(name, 'aplicar_sincronizacion_ical')
      await apply(db, args.p_esperado, args.p_operaciones)
      return { error: null }
    } }
    const events = [{ start: '2090-01-01', end: '2090-01-04', summary: 'CLOSED' },
      { start: '2090-01-06', end: '2090-01-10', summary: 'CLOSED' }]
    const first = await sincronizarIcal(api, events, propiedad, 'booking', await snapshot(db))
    assert.equal(first.reabiertas, 1)
    const rows = await snapshot(db)
    assert.deepEqual(rows.map(r => r.noches).sort(), [3, 4])
    const second = await sincronizarIcal(api, events, propiedad, 'booking', rows)
    assert.equal(second.reabiertas, 0)
    assert.deepEqual(await snapshot(db), rows)
    await sincronizarIcal(api, [], propiedad, 'booking', rows)
    assert.deepEqual(await snapshot(db), [])
  } finally { await db.close() }
})

test('RLS denying a parent deletion also rolls back child payment deletions', async () => {
  const db = await database()
  try {
    await db.exec(`insert into pagos values('${payment}','${reserva}',50);
      alter table reservas enable row level security;
      create policy read_reservas on reservas for select to authenticated using(true);
      create policy update_reservas on reservas for update to authenticated using(true);
      grant usage on schema public to authenticated;
      grant select,update,delete on reservas to authenticated;
      grant select,delete on pagos to authenticated;
      set role authenticated;`)
    await assert.rejects(db.query('select eliminar_reserva_segura($1)', [reserva]), /No se pudo eliminar/)
    await db.exec('reset role')
    assert.equal((await db.query('select monto from pagos')).rows[0].monto, '50')
    assert.equal((await snapshot(db)).length, 1)
  } finally { await db.close() }
})
