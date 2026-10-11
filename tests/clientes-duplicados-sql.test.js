import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('clientes: evita duplicados nuevos sin borrar ni bloquear edicion de contacto de los antiguos', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create table clientes(id uuid primary key default gen_random_uuid(),nombre text,apellido text,dni text,email text);
      insert into clientes(nombre,dni) values ('Matias Aratano','111'),('Matias Aratano','222');`)
    const sql = readFileSync(new URL('../supabase/migrations/20261011_clientes_sin_duplicados.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    const insert = (nombre, apellido, dni) => db.query('insert into clientes(nombre,apellido,dni) values($1,$2,$3)', [nombre,apellido,dni])
    await assert.rejects(insert(' Matias  ', 'ARATANO', '333'), /Ya existe un cliente/)
    await assert.rejects(insert('Otro nombre', null, '1.1 1'), /Ya existe un cliente/)
    await insert('Gisela', null, null)
    await assert.rejects(insert('gisela ', '', ''), /Ya existe un cliente/)
    await insert('Persona diferente', null, '')
    await db.exec("update clientes set email='ejemplo@example.com',nombre=nombre where nombre='Matias Aratano'")
    await assert.rejects(db.exec("update clientes set nombre='Gisela' where nombre='Persona diferente'"), /Ya existe un cliente/)
    assert.equal((await db.query('select count(*)::int as n from clientes')).rows[0].n,4)
    assert.equal((await db.query("select count(*)::int as n from clientes where nombre='Matias Aratano'")).rows[0].n,2)
  } finally { await db.close() }
})
