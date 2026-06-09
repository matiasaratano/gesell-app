import { isAllowedIcalUrl, fetchIcalUpstream } from './lib/ical-upstream.js'

/**
 * Vercel Serverless: GET /api/ical?url=https://...
 * Descarga el .ics en el servidor (Booking/Airbnb no aplican CORS al navegador).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const raw = req.query?.url
  const url = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''

  if (!url?.trim()) {
    return res.status(400).json({ error: 'Falta el parámetro url' })
  }

  if (!isAllowedIcalUrl(url)) {
    return res.status(403).json({
      error: 'Solo se permiten URLs de calendario de Booking o Airbnb',
    })
  }

  try {
    const text = await fetchIcalUpstream(url)
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Cache-Control', 'private, max-age=120')
    return res.status(200).send(text)
  } catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 502
    return res.status(status).json({ error: e.message || 'Error al descargar' })
  }
}
