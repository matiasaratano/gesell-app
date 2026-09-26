import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { hoyLocal, pendientesLimpieza } from '../lib/operacion-reserva.js'
import './cobros.css'

export default function PendientesLimpieza({ propiedadId = '' }) {
  const [filas, setFilas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(null)
  const [revision, setRevision] = useState(0)
  const hoy = hoyLocal()
  const visibles = filas.filter(r => !propiedadId || r.propiedad_id === propiedadId)
  useEffect(() => {
    let active = true
    async function cargar() {
      const rows = []
      for (let desde = 0; ; desde += 1000) {
        const { data, error: err } = await supabase.from('reservas').select('*, propiedades(nombre)')
          .lte('checkout', hoy).not('estado', 'in', '("cerrada","cancelada")')
          .order('id').range(desde, desde + 999)
        if (err) throw err
        if (data.some(r => !Object.hasOwn(r, 'limpieza_completada_para'))) throw new Error('Estado de limpieza no disponible.')
        rows.push(...data)
        if (data.length < 1000) break
      }
      if (active) { setFilas(pendientesLimpieza(rows)); setError('') }
    }
    cargar().catch(() => { if (active) setError('No se pudo cargar el estado de limpieza.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [revision, hoy])
  async function limpiar(r) {
    if (guardando) return
    setGuardando(r.id)
    const { data, error: err } = await supabase.from('reservas').update({ limpieza_completada_para: r.checkout })
      .eq('id', r.id).eq('checkout', r.checkout).select('id').single()
    setGuardando(null)
    if (err || !data) { setError('No se pudo guardar la limpieza.'); return }
    setRevision(v => v + 1)
  }
  return <section className="cobros limpieza-panel" aria-label="Limpieza pendiente"><h3>Limpieza pendiente {!loading && !error && `· ${visibles.length}`}</h3>
    {error && <p role="alert" className="cobros-error">{error}</p>}
    {loading ? <p role="status">Cargando…</p> : !error && !visibles.length ? <p>No hay limpiezas pendientes.</p> : <ul className="cobros-historial">{visibles.map(r => <li key={r.id}><div><strong>{r.propiedades?.nombre}</strong><small>Salida {r.checkout.split('-').reverse().join('/')}</small><Link to={`/reservas/${r.id}`}>Ver reserva</Link></div><button className="cobros-primary" disabled={!!guardando} onClick={() => limpiar(r)}>{guardando === r.id ? 'Guardando…' : 'Marcar limpio'}</button></li>)}</ul>}
  </section>
}
