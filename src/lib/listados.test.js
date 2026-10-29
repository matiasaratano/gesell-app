import test from 'node:test'
import assert from 'node:assert/strict'
import { leerListado } from './listados.js'
test('pagina todos los registros y no devuelve un listado incompleto ante un error', async () => {
  const filas = Array.from({ length: 1201 }, (_, id) => ({ id }))
  assert.deepEqual(await leerListado(() => ({ range: (a, b) => ({ data: filas.slice(a, b + 1) }) })), filas)
  await assert.rejects(leerListado(() => ({ range: a => a ? { error: new Error('Sin red') } : { data: filas.slice(0, 500) } })), /Sin red/)
})
