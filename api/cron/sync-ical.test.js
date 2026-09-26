import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import handler from './sync-ical.js'
test('el cron no permite sincronizar sin secreto ni con una credencial incorrecta', async () => {
  const previous = process.env.CRON_SECRET
  const res = { status(code) { this.code=code; return this }, json(data) { this.data=data; return this } }
  try {
    delete process.env.CRON_SECRET
    await handler({method:'GET',headers:{}},res)
    assert.equal(res.code,503)
    process.env.CRON_SECRET='test-only-secret'
    await handler({method:'GET',headers:{authorization:'Bearer incorrecto'}},res)
    assert.equal(res.code,401)
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET=previous
  }
})

test('el cron devuelve fallo parcial y no escribe reservas por REST si una transaccion falla', async () => {
  const keys = ['CRON_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]))
  const originalFetch = globalThis.fetch
  const writes = []
  const res = { status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  try {
    process.env.CRON_SECRET = 'test-only-secret'
    process.env.SUPABASE_URL = 'https://database.test'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key'
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url)
      const reply = (data, status = 200) => new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
      })
      if (url.hostname === 'booking.com') return new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n')
      if (url.pathname === '/rest/v1/propiedades') return reply([
        { id: 'p1', link_ical_booking: 'https://booking.com/test.ics' },
        { id: 'p2', link_ical_airbnb: 'https://invalid.test/test.ics' },
      ])
      if (url.pathname === '/rest/v1/reservas') {
        assert.equal(options.method || 'GET', 'GET')
        return reply([])
      }
      if (url.pathname === '/rest/v1/rpc/aplicar_sincronizacion_ical') {
        writes.push(url.pathname)
        return reply({ code: 'P0001', message: 'Cambio concurrente simulado' }, 400)
      }
      if (url.pathname === '/rest/v1/ical_sync_log') return reply([])
      throw new Error(`Solicitud inesperada en prueba: ${url.pathname}`)
    }
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-only-secret' } }, res)
    assert.equal(res.code, 502)
    assert.equal(res.data.ok, false)
    assert.equal(res.data.resultados.length, 2)
    assert.match(res.data.resultados[0].error, /Cambio concurrente/)
    assert.match(res.data.resultados[1].error, /proveedor permitido/)
    assert.equal(writes.length, 1)
  } finally {
    globalThis.fetch = originalFetch
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})
