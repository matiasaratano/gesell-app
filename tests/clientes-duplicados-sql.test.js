import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('clientes: reemplaza bloqueo antiguo por excepcion confirmable sin borrar registros', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create table clientes(id uuid primary key default gen_random_uuid(),nombre text,apellido text,dni text,email text);
      insert into clientes(nombre,dni) values ('Matias Aratano','111'),('Matias Aratano','222');`)
    await db.exec(`create function evitar_cliente_duplicado() returns trigger language plpgsql as $$begin raise exception 'bloqueo antiguo';end$$;
      create trigger clientes_evitar_duplicados before insert on clientes for each row execute function evitar_cliente_duplicado();`)
    const sql = readFileSync(new URL('../supabase/migrations/20261011_clientes_aviso_duplicados.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    const insert = (nombre, apellido, dni) => db.query('insert into clientes(nombre,apellido,dni) values($1,$2,$3)', [nombre,apellido,dni])
    await insert(' Matias  ', 'ARATANO', '333')
    await insert('Otro nombre', null, '1.1 1')
    await insert('Gisela', null, null)
    await insert('gisela ', '', '')
    await insert('Persona diferente', null, '')
    await db.exec("update clientes set email='ejemplo@example.com',nombre=nombre where nombre='Matias Aratano'")
    assert.equal((await db.query('select count(*)::int as n from clientes')).rows[0].n,7)
    assert.equal((await db.query("select count(*)::int as n from clientes where nombre='Matias Aratano'")).rows[0].n,2)
  } finally { await db.close() }
})
