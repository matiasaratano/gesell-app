/**
 * Lógica compartida: validar URL del feed iCal y descargarlo (solo servidor / sin CORS en el navegador).
 */

export function isAllowedIcalUrl(urlStr) {
  let u
  try {
    u = new URL(urlStr)
  } catch {
    return false
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const h = u.hostname.toLowerCase()
  return (
    h === 'booking.com' ||
    h.endsWith('.booking.com') ||
    h === 'airbnb.com' ||
    h.endsWith('.airbnb.com')
  )
}

export async function fetchIcalUpstream(urlStr) {
  const r = await fetch(urlStr, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; GesellApp/1.0; calendar sync)',
      Accept: 'text/calendar, text/plain, */*',
    },
  })
  if (!r.ok) {
    const err = new Error(`El calendario respondió HTTP ${r.status}`)
    err.status = r.status
    throw err
  }
  return r.text()
}
