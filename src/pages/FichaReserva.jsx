import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CRUDReservas } from './Admin'
import CobrosReserva from '../components/CobrosReserva'
import { nombreCliente } from '../lib/cobros.js'
import { hoyLocal, mensajeReserva } from '../lib/operacion-reserva.js'
import { reservaDesdeCierre } from '../lib/calendario-grid.js'
import { mesAnterior, sumarDias } from '../lib/mensualidades.js'

const fecha = value => value?.slice(0, 10).split('-').reverse().join('/') || '—'
const valorHistorial = (key, value) => {
  if (value == null || value === '') return '—'
  if (['checkin', 'checkout', 'recordar_el', 'limpieza_completada_para', 'fecha_recibido'].includes(key)) return fecha(value)
  if (key === 'periodo_mes') return String(value).slice(0, 7).split('-').reverse().join('/')
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  return String(value)
}
const campos = { checkin: 'Ingreso', checkout: 'Salida', estado: 'Estado', canal_origen: 'Canal', precio_total: 'Precio total', modalidad: 'Tipo de alquiler', requiere_sena: 'Requiere seña', recordar_el: 'Recordatorio', limpieza_completada_para: 'Limpieza completada', notas_internas: 'Notas', adultos: 'Adultos', menores: 'Menores', monto: 'Importe', tipo: 'Concepto', fecha_recibido: 'Fecha de cobro', metodo: 'Medio de pago', confirmado: 'Pago contabilizado', periodo_mes: 'Mes abonado' }
function cambios(entry) {
  if (entry.accion === 'INSERT') return entry.tabla === 'pagos' ? 'Pago registrado' : 'Reserva creada'
  if (entry.accion === 'DELETE') return entry.tabla === 'pagos' ? 'Pago eliminado' : 'Reserva eliminada'
  const partes = Object.entries(campos).filter(([key]) => JSON.stringify(entry.antes?.[key]) !== JSON.stringify(entry.despues?.[key]))
    .map(([key, label]) => `${label}: ${valorHistorial(key, entry.antes?.[key])} → ${valorHistorial(key, entry.despues?.[key])}`)
  if (entry.antes?.cliente_id !== entry.despues?.cliente_id) partes.push('Cliente actualizado')
  if (JSON.stringify(entry.antes?.plan_mensual) !== JSON.stringify(entry.despues?.plan_mensual)) partes.push('Plan de mensualidades actualizado')
  if (entry.antes?.booking_contactado_el !== entry.despues?.booking_contactado_el) partes.push(`Contacto Booking: ${fecha(entry.despues?.booking_contactado_el)}`)
  return partes.join('\n') || 'Datos de la reserva actualizados'
}

export default function FichaReservaRuta() {
  const { id } = useParams()
  return <FichaReserva key={id} />
}

function FichaReserva() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [reserva, setReserva] = useState(null)
  const [pagos, setPagos] = useState([])
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState(params.get('vista') === 'pagos' ? 'pagos' : 'datos')
  const [editor, setEditor] = useState(null)
  const [recordar, setRecordar] = useState('')
  const [borrador, setBorrador] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [abrir, setAbrir] = useState(false)
  const [historial, setHistorial] = useState([])
  const [historialError, setHistorialError] = useState('')
  const [limite, setLimite] = useState(30)

  function recargar() { setRevision(v => v + 1) }
  useEffect(() => {
    let active = true
    Promise.all([
      supabase.from('reservas').select('*, clientes(*), propiedades(*)').eq('id', id).single(),
      supabase.from('pagos').select('*').eq('reserva_id', id),
    ]).then(([r, p]) => {
      if (!active) return
      if (r.error || p.error) { setError('No se pudo cargar la reserva y sus cobros.'); setLoading(false); return }
      setError(''); setReserva(r.data); setPagos(p.data || []); setRecordar(r.data.recordar_el || ''); setLoading(false)
      if (params.get('accion') === 'asignar-inquilino') {
        setEditor(reservaDesdeCierre(r.data)); setParams({}, { replace: true })
      } else if (params.get('accion') === 'editar') {
        setEditor(r.data); setParams({}, { replace: true })
      }
    })
    return () => { active = false }
  }, [id, revision, params, setParams])

  useEffect(() => {
    let active = true
    if (tab !== 'historial') return
    supabase.from('reserva_historial').select('*').eq('reserva_id', id).order('registrado_at', { ascending: false }).limit(limite)
      .then(({ data, error: err }) => {
        if (!active) return
        setHistorialError(err ? 'No se pudo cargar el historial.' : '')
        setHistorial(data || [])
      })
    return () => { active = false }
  }, [id, tab, revision, limite])

  async function actualizar(campos) {
    if (guardando) return
    setGuardando(true); setError(''); setMensaje('')
    const { data, error: err } = await supabase.from('reservas').update(campos).eq('id', id).select('id').single()
    setGuardando(false)
    if (err || !data) { setError('No se pudo guardar el cambio.'); return }
    setMensaje('Cambio guardado.'); recargar()
  }
  async function reabrir() {
    if (guardando) return
    setGuardando(true); setError('')
    const { data, error: err } = await supabase.from('reservas').delete().eq('id', id).eq('estado', 'cerrada').in('canal_origen', ['directo', 'manual']).select('id').single()
    setGuardando(false)
    if (err || !data) { setError('No se pudo abrir el cierre manual.'); return }
    navigate('/calendario')
  }
  if (loading) return <main className="cobros cobros-page"><p role="status">Cargando reserva…</p></main>
  if (!reserva) return <main className="cobros cobros-page"><p role="alert">{error}</p><button onClick={recargar}>Reintentar</button></main>
  if (editor) return <main className="cobros cobros-page"><CRUDReservas key={editor.id} reservaInicial={editor} onSaved={() => { setEditor(null); recargar() }} onCancel={() => setEditor(null)} onDeleted={() => navigate('/calendario')} /></main>
  const texto = borrador ?? mensajeReserva(reserva, pagos)
  const cerrada = reserva.estado === 'cerrada'
  const manual = ['directo', 'manual'].includes(reserva.canal_origen)
  const limpia = reserva.limpieza_completada_para === reserva.checkout
  return <main className="cobros cobros-page ficha-reserva">
    <header className="ficha-cabecera">
    <h1 className="ficha-titulo">{cerrada ? `Cierre ${manual ? 'manual' : reserva.canal_origen}` : nombreCliente(reserva)}</h1>
    <Link className="cobros-link" to="/calendario">Volver al calendario</Link>
    </header>
    <p>{reserva.propiedades?.nombre} · {fecha(reserva.checkin)} → {fecha(reserva.checkout)}</p>
    <p>{reserva.estado} · {manual ? 'Manual' : reserva.canal_origen}</p>
    <div className="cobros-acciones ficha-acciones"><button className="cobros-primary" onClick={() => setEditor(reserva)}>Editar reserva</button>
      {!cerrada && <Link className="cobros-link" to={`/recibos?reserva_id=${reserva.id}`}>Recibos de pagos</Link>}
      {cerrada && <button className="cobros-primary" onClick={() => setEditor(reservaDesdeCierre(reserva))}>Asignar inquilino</button>}
      {cerrada && manual && <button onClick={() => setAbrir(true)}>Abrir cierre manual</button>}
    </div>
    {abrir && <div className="cobros-aviso"><p>¿Abrir este cierre manual? Estas fechas quedarán disponibles si no hay otro bloqueo.</p><div className="cobros-acciones"><button disabled={guardando} onClick={reabrir}>Abrir cierre</button><button onClick={() => setAbrir(false)}>Cancelar</button></div></div>}
    {error && <p role="alert" className="cobros-error">{error}</p>}
    {mensaje && <p role="status">{mensaje}</p>}
    <div className="cobros-tabs" aria-label="Secciones de la reserva">{Object.entries({ datos: 'Datos y tareas', ...(!cerrada ? { pagos: 'Pagos', recordatorio: 'Recordatorio', mensaje: 'WhatsApp' } : {}), historial: 'Historial' }).map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === 'datos' && <div className="ficha-datos">
      <dl><dt>Cliente</dt><dd>{nombreCliente(reserva)}</dd><dt>Teléfono</dt><dd>{reserva.clientes?.whatsapp || 'Sin teléfono'}</dd><dt>Huéspedes</dt><dd>{reserva.adultos || 0} adultos · {reserva.menores || 0} menores</dd><dt>Tipo de alquiler</dt><dd>{reserva.modalidad === 'mensual' ? 'Largo / mensual' : 'Temporal'}</dd></dl>
      {reserva.notas_internas && <section><h3>Notas internas</h3><p className="ficha-notas">{reserva.notas_internas}</p></section>}
      {!cerrada && reserva.canal_origen === 'booking' && <section><h3>Seguimiento de Booking</h3>
        <p>{reserva.booking_contactado_el ? `Contactado el ${fecha(reserva.booking_contactado_el)}` : `Contactar a partir del ${fecha(sumarDias(reserva.checkin, -45))}`}</p>
        {reserva.modalidad !== 'mensual' && reserva.requiere_sena !== false && !pagos.some(p => p.confirmado && Number(p.monto) > 0) && <p>Verificar condiciones de cobro en Booking a partir del {fecha(mesAnterior(reserva.checkin))}</p>}
        <button disabled={guardando} onClick={() => actualizar({ booking_contactado_el: reserva.booking_contactado_el ? null : hoyLocal() })}>{reserva.booking_contactado_el ? 'Marcar contacto pendiente' : 'Marcar como contactado'}</button>
      </section>}
      {!cerrada && reserva.estado !== 'cancelada' && reserva.checkout <= hoyLocal() && <section><h3>Limpieza · {reserva.propiedades?.nombre}</h3><p>{limpia ? 'Limpieza completada' : 'Pendiente de limpieza'} · salida {fecha(reserva.checkout)}</p><button disabled={guardando} onClick={() => actualizar({ limpieza_completada_para: limpia ? null : reserva.checkout })}>{limpia ? 'Marcar pendiente' : 'Marcar limpio'}</button></section>}
    </div>}
    {tab === 'recordatorio' && !cerrada && <section className="ficha-recordatorio">
      <h3>Recordatorio de la reserva</h3>
      {reserva.recordar_el && <p>Fecha guardada: {fecha(reserva.recordar_el)}</p>}
      <div className="pago-fields"><label>Recordar el<input type="date" min={hoyLocal()} value={recordar} onChange={e => setRecordar(e.target.value)} /></label></div>
      <div className="cobros-acciones"><button className="cobros-primary" disabled={guardando || !recordar || recordar < hoyLocal()} onClick={() => actualizar({ recordar_el: recordar })}>Guardar fecha</button>{reserva.recordar_el && <button disabled={guardando} onClick={() => actualizar({ recordar_el: null })}>Reactivar pendientes</button>}</div>
    </section>}
    {tab === 'pagos' && !cerrada && <CobrosReserva key={id} reserva={reserva} onChange={recargar} mesInicial={params.get('mes') || ''} />}
    {tab === 'mensaje' && !cerrada && <section className="ficha-mensaje"><h3>Detalle para el huésped</h3><textarea aria-label="Mensaje para WhatsApp" rows={10} value={texto} onChange={e => setBorrador(e.target.value)} /><div className="cobros-acciones"><button onClick={async () => { try { await navigator.clipboard.writeText(texto); setMensaje('Mensaje copiado.') } catch { setError('No se pudo copiar el mensaje.') } }}>Copiar mensaje</button><button onClick={() => setBorrador(null)}>Actualizar detalle</button>{reserva.clientes?.whatsapp && <a className="cobros-link" target="_blank" rel="noreferrer" href={`https://wa.me/${reserva.clientes.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`}>Abrir WhatsApp</a>}</div></section>}
    {tab === 'historial' && <section><h3>Historial de cambios</h3>{historialError && <p role="alert">{historialError}</p>}{!historialError && !historial.length && <p>No hay cambios registrados todavía.</p>}<ul className="cobros-historial">{historial.map(h => <li key={h.id}><div><small>{new Date(h.registrado_at).toLocaleString('es-AR')} · {h.origen === 'ical' ? 'Sincronización iCal' : h.origen === 'automatico' ? 'Actualización automática' : 'App'}</small><p className="ficha-notas">{cambios(h)}</p></div></li>)}</ul>{historial.length === limite && <button onClick={() => setLimite(n => n + 30)}>Ver cambios anteriores</button>}</section>}
  </main>
}
