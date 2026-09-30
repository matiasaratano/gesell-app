import test from 'node:test'
import assert from 'node:assert/strict'
import { errorFormulario } from './error-formulario.js'

test('el formulario explica validaciones conocidas del servidor', () => {
  assert.match(errorFormulario({ code: 'P0001', message: 'Email invalido.' }), /Revisá el email/)
  assert.match(errorFormulario({ code: 'P0001', message: 'Revisa fechas y huespedes.' }), /ingreso no puede ser anterior/)
})
test('errores de base muestran codigo sin filtrar datos personales ni detalles internos', () => {
  const texto = errorFormulario({ code: '23502', message: 'null value', details: 'Failing row contains (Ana, DNI privado)' })
  assert.match(texto, /23502/)
  assert.doesNotMatch(texto, /Ana|DNI|Failing row|null value/)
  assert.doesNotMatch(errorFormulario({ code: 'P0001', message: 'Datos internos privados' }), /Datos internos/)
  assert.doesNotMatch(errorFormulario({ code: '<script>' }), /script/)
})
