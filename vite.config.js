import { defineConfig, loadEnv } from 'vite'
import process from 'node:process'
import react from '@vitejs/plugin-react'
import { isAllowedIcalUrl, fetchIcalUpstream } from './api/lib/ical-upstream.js'
import { requireAdmin } from './api/lib/admin-auth.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'ical-proxy-dev',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const full = req.url || ''
          if (!full.startsWith('/api/ical')) return next()
          const denied = await requireAdmin(req.headers, { ...loadEnv(mode, process.cwd(), ''), ...process.env })
          if (denied) { res.statusCode = denied; res.end('Se requiere acceso administrativo.'); return }
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.statusCode = 405
            res.end()
            return
          }
          const q = full.indexOf('?')
          const params = new URLSearchParams(q >= 0 ? full.slice(q + 1) : '')
          const target = params.get('url')
          if (!target) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Falta el parámetro url' }))
            return
          }
          if (!isAllowedIcalUrl(target)) {
            res.statusCode = 403
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: 'Solo se permiten URLs de calendario de Booking o Airbnb',
              })
            )
            return
          }
          try {
            const text = await fetchIcalUpstream(target)
            res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
            res.statusCode = 200
            res.end(text)
          } catch (e) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: e.message || 'Error al descargar' }))
          }
        })
      },
    },
  ],
}))
