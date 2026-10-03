import test from 'node:test'
import assert from 'node:assert/strict'
import { avisoCapacidad } from './capacidad.js'

test('advierte al exceder la capacidad incluyendo menores', () => {
  const mensaje = avisoCapacidad({ nombre: 'Depto 2', capacidad_max: 2 }, { adultos: 2, menores: 3 })
  assert.match(mensaje, /admite hasta 2 personas/)
  assert.match(mensaje, /cargando 5/)
})
test('permite alcanzar el limite y admite valores numericos serializados', () => {
  assert.equal(avisoCapacidad({ capacidad_max: '2' }, { adultos: '1', menores: '1' }), '')
})
test('no inventa limites cuando falta la capacidad', () => {
  for (const capacidad_max of [null, undefined, 0, '']) {
    assert.equal(avisoCapacidad({ capacidad_max }, { adultos: 5 }), '')
  }
})
