import test from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedIcalUrl } from './ical-upstream.js'

test('acepta calendarios de Booking y Airbnb global y Argentina', () => {
  for (const host of ['admin.booking.com', 'booking.com', 'airbnb.com', 'www.airbnb.com', 'airbnb.com.ar', 'www.airbnb.com.ar']) {
    assert.equal(isAllowedIcalUrl(`https://${host}/calendar/ical/test.ics`), true, host)
  }
})

test('rechaza dominios parecidos y protocolos ajenos a HTTP', () => {
  for (const url of ['https://airbnb.com.ar.ejemplo.com/test.ics', 'https://fakeairbnb.com.ar/test.ics', 'https://airbnb.com.ar@ejemplo.com/test.ics', 'file:///calendar.ics', 'ftp://airbnb.com.ar/test.ics', 'no es una URL']) {
    assert.equal(isAllowedIcalUrl(url), false, url)
  }
})
