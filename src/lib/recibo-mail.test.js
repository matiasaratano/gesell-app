import test from 'node:test'
import assert from 'node:assert/strict'
import { enlaceMailRecibo } from './recibo-mail.js'

test('correo del recibo conserva texto, saltos y caracteres especiales', () => {
  const texto = 'RECIBO N° 1\nRecibí $350.000\nAna & José + 30%'
  const url = new URL(enlaceMailRecibo(' ana@example.com ', 'Recibo N° 1', texto))
  assert.equal(url.origin, 'https://mail.google.com')
  assert.equal(url.searchParams.get('to'), 'ana@example.com')
  assert.equal(url.searchParams.get('su'), 'Recibo N° 1')
  assert.equal(url.searchParams.get('body'), texto)
})
test('sin correo abre un borrador con destinatario vacío', () => {
  assert.equal(new URL(enlaceMailRecibo(null, 'Recibo', 'Detalle')).searchParams.get('to'), '')
})
