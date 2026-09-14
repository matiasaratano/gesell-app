import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { dinero, nombreCliente, normalizarBusqueda, resumenCobros } from '../lib/cobros'
import CobrosReserva from '../components/CobrosReserva'

const etiquetas = { todos: 'Todas', 'sin-sena': 'Sin seña', 'con-sena': 'Con seña', pagada: 'Pagadas', 'sin-requisito': 'No requiere seña' }
const fecha = value => value?.split('-').reverse().join('/') || '—'

async function leerTodas(tabla, columnas) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select(columnas).order('id').range(desde, desde + 999)
    if (error) throw error
    filas.push(...data)
    if (data.length < 1000) return filas
  }
}

export default function Cobros() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [reservas, setReservas] = useState([])
  const [pagos, setPagos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [propiedad, setPropiedad] = useState('')
  const [periodo, setPeriodo] = useState('proximas')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [revision, setRevision] = useState(0)
  function recargar() {
    setCargando(true)
    setError('')
    setRevision(v => v + 1)
  }
  useEffect(() => {
    let activo = true
    Promise.all([
      leerTodas('reservas', '*, clientes(nombre, apellido, whatsapp), propiedades(nombre)'),
      leerTodas('pagos', '*'),
    ]).then(([rs, ps]) => {
      if (activo) { setReservas(rs); setPagos(ps) }
    }).catch(err => { if (activo) setError('No se pudieron cargar los cobros. ' + err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [revision])

  const seleccionada = reservas.find(r => r.id === params.get('reserva_id'))
  const ahora = new Date()
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
  const propiedades = [...new Map(reservas.map(r => [r.propiedad_id, r.propiedades?.nombre || 'Sin alojamiento'])).entries()]
  const temporadas = [...new Set(reservas.flatMap(r => {
    const inicio = Number(r.checkin?.slice(0, 4)) - 1
    const fin = Number(r.checkout?.slice(0, 4))
    return Array.from({ length: Math.max(0, Math.min(100, fin - inicio + 1)) }, (_, i) => inicio + i)
  }))].filter(Number.isFinite).sort((a, b) => b - a)
  const porReserva = new Map()
  for (const p of pagos) porReserva.set(p.reserva_id, [...(porReserva.get(p.reserva_id) || []), p])
  const lista = reservas.filter(r => !['cerrada', 'cancelada'].includes(r.estado)).map(r => ({ ...r, cobro: resumenCobros(r, porReserva.get(r.id)) })).filter(r => {
    const texto = normalizarBusqueda(`${nombreCliente(r)} ${r.clientes?.whatsapp || ''} ${r.propiedades?.nombre || ''}`)
    const busca = normalizarBusqueda(busqueda.trim())
    const telefono = busca.replace(/\D/g, '')
    const coincide = texto.includes(busca) || (telefono.length >= 3 && String(r.clientes?.whatsapp || '').replace(/\D/g, '').includes(telefono))
    const enPeriodo = periodo === 'todas' || (periodo === 'proximas' ? r.checkout >= hoy : r.checkin < `${Number(periodo) + 1}-04-01` && r.checkout > `${periodo}-12-01`)
    return coincide && enPeriodo && (!propiedad || r.propiedad_id === propiedad) && (filtro === 'todos' || r.cobro.estado === filtro || (filtro === 'con-sena' && r.cobro.estado === 'pagada'))
  }).sort((a, b) => a.checkin.localeCompare(b.checkin))

  if (params.get('reserva_id')) return <Navigate to={`/reservas/${params.get('reserva_id')}?vista=pagos`} replace />
  return <main className="cobros cobros-page">
    <h1>Señas y cobros</h1>
    {error && <div role="alert" className="cobros-error">{error} <button onClick={recargar}>Reintentar</button></div>}
    {seleccionada ? <>
      <button onClick={() => setParams({})}>Volver a cobros</button>
      <h2 className="cobros-cliente">{nombreCliente(seleccionada)}</h2>
      <p>{seleccionada.propiedades?.nombre} · {fecha(seleccionada.checkin)} → {fecha(seleccionada.checkout)}</p>
      <p>{seleccionada.canal_origen === 'directo' ? 'Manual' : seleccionada.canal_origen} · {seleccionada.estado}</p>
      <div className="cobros-acciones">
        <Link className="cobros-link" to={`/admin?seccion=reservas&reserva_id=${seleccionada.id}`}>Detalle de reserva</Link>
        {seleccionada.clientes?.whatsapp && <a className="cobros-link" href={`https://wa.me/${seleccionada.clientes.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>}
      </div>
      <CobrosReserva key={seleccionada.id} reserva={seleccionada} onChange={recargar} />
    </> : <>
      {params.get('reserva_id') && !cargando && !error && <p role="status">No se encontró esa reserva.</p>}
      <div className="cobros-filtros">
        <label>Buscar cliente<input type="search" placeholder="Nombre, teléfono o alojamiento" value={busqueda} onChange={e => setBusqueda(e.target.value)} /></label>
        <label>Alojamiento<select value={propiedad} onChange={e => setPropiedad(e.target.value)}><option value="">Todos</option>{propiedades.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}</select></label>
        <label>Período<select value={periodo} onChange={e => setPeriodo(e.target.value)}><option value="proximas">Actuales y próximas</option><option value="todas">Todo el historial</option>{temporadas.map(y => <option key={y} value={y}>Verano {y}/{y + 1}</option>)}</select></label>
      </div>
      <div className="cobros-tabs" aria-label="Estado del cobro">{Object.entries(etiquetas).map(([id, label]) => <button key={id} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{label}</button>)}</div>
      {cargando ? <p role="status">Cargando cobros…</p> : !error && <>
        <div className="cobros-resumen-lista"><span>{lista.length} reservas</span><span>Recibido <strong>{dinero(lista.reduce((sum, r) => sum + r.cobro.recibido, 0))}</strong></span></div>
        {!lista.length && <p>No hay reservas con estos filtros.</p>}
        <ul className="cobros-lista">{lista.map(r => <li key={r.id}>
          <div><strong>{nombreCliente(r)}</strong><p>{r.propiedades?.nombre} · {fecha(r.checkin)} → {fecha(r.checkout)}</p>
            <span className={`cobros-badge cobros-badge-${r.cobro.estado}`}>{etiquetas[r.cobro.estado]}</span>
            <div className="cobros-importes"><div><small>Total estadía</small><strong>{r.cobro.total === null ? 'A revisar' : dinero(r.cobro.total)}</strong></div><div><small>Recibido</small><strong>{dinero(r.cobro.recibido)}</strong></div><div><small>Saldo</small><strong>{r.cobro.saldo === null ? 'Sin calcular' : dinero(r.cobro.saldo)}</strong></div></div>
          </div>
          <button onClick={() => navigate(`/reservas/${r.id}?vista=pagos`)}>Ver cobros</button>
        </li>)}</ul>
      </>}
    </>}
  </main>
}
