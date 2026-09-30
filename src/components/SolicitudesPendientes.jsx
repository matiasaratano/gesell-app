import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fechaSolicitud, solicitudesAccionables, solicitudLista } from '../lib/solicitudes.js'
import './cobros.css'
import '../pages/solicitudes.css'

export default function SolicitudesPendientes({ propiedadId = '', ...componentes }) {
  const Contenedor = componentes.Contenedor
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [intento, setIntento] = useState(0)
  useEffect(() => {
    let activo = true
    async function cargar() {
      setLoading(true); setError('')
      try {
        const solicitudes = []
        for (let desde = 0; ; desde += 500) {
          const { data, error } = await supabase.from('solicitudes')
            .select('id,datos_cliente,propiedad_id,checkin,checkout,precio_total,estado,propiedades(nombre)')
            .eq('estado','abierta').order('checkin').order('id').range(desde,desde+499)
          if (error) throw error
          solicitudes.push(...data)
          if (data.length < 500) break
        }
        if (activo) setRows(solicitudes)
      } catch { if (activo) setError('No se pudieron cargar las solicitudes.') }
      finally { if (activo) setLoading(false) }
    }
    cargar()
    return () => { activo = false }
  }, [intento])
  const pendientes = solicitudesAccionables(rows, propiedadId)
  if (!loading && !error && !pendientes.length) return null
  return <section className="solicitudes-inicio" aria-label="Solicitudes para revisar"><Contenedor titulo="Solicitudes para revisar" badge={!error && !loading ? pendientes.length : undefined} accion={{ label: 'Ver todas', to: '/solicitudes' }}>
    <div className="cobros">
      {loading ? <p role="status">Cargando solicitudes…</p> : error ? <div role="alert"><p>{error}</p><button onClick={()=>setIntento(n=>n+1)}>Reintentar solicitudes</button></div> : <ul className="solicitudes-inicio-lista">
        {pendientes.slice(0,5).map(s => <li key={s.id}>
          <div className="solicitudes-inicio-datos"><strong>{s.datos_cliente?.nombre} {s.datos_cliente?.apellido}</strong><span>{s.propiedades?.nombre || 'Sin departamento'} · {fechaSolicitud(s.checkin)} → {fechaSolicitud(s.checkout)}</span></div>
          <Link className="cobros-link" to={`/solicitudes?solicitud=${encodeURIComponent(s.id)}`}>{solicitudLista(s) ? 'Revisar' : 'Asignar'}</Link>
        </li>)}
      </ul>}
    </div>
  </Contenedor></section>
}
