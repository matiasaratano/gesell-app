import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CRUDReservas } from './Admin'
import CobrosReserva from '../components/CobrosReserva'
import { dinero, nombreCliente, resumenCobros } from '../lib/cobros.js'
import { hoyLocal } from '../lib/operacion-reserva.js'
import { reservaDesdeCierre } from '../lib/calendario-grid.js'
import { cierreImportadoDisponible } from '../lib/disponibilidad-solicitud.js'
import { mesAnterior, sumarDias } from '../lib/mensualidades.js'
import { useConfirmacion } from '../lib/confirmacion.js'
import CancelarReserva from '../components/CancelarReserva'
import MensajesReserva from '../components/MensajesReserva'
import { proximaAccion } from '../lib/proxima-accion.js'
import PagoRapido from '../components/PagoRapido'

const fecha = value => value?.slice(0, 10).split('-').reverse().join('/') || '—'
const plataformas = {
  booking: { nombre: 'Booking', url: 'https://admin.booking.com/' },
  airbnb: { nombre: 'Airbnb', url: 'https://www.airbnb.com/hosting' },
}
const valorHistorial = (key, value) => {
  if (value == null || value === '') return '—'
  if (['checkin', 'checkout', 'recordar_el', 'limpieza_completada_para', 'fecha_recibido'].includes(key)) return fecha(value)
  if (key === 'periodo_mes') return String(value).slice(0, 7).split('-').reverse().join('/')
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  return String(value)
}
const campos = { checkin: 'Ingreso', checkout: 'Salida', estado: 'Estado', cancelacion_motivo: 'Motivo de cancelación', canal_origen: 'Canal', precio_total: 'Precio total', modalidad: 'Tipo de alquiler', requiere_sena: 'Requiere seña', recordar_el: 'Recordatorio', limpieza_completada_para: 'Limpieza completada', notas_internas: 'Notas', adultos: 'Adultos', menores: 'Menores', monto: 'Importe', tipo: 'Concepto', fecha_recibido: 'Fecha de cobro', metodo: 'Medio de pago', confirmado: 'Pago contabilizado', periodo_mes: 'Mes abonado' }
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
  const confirmar = useConfirmacion()
  const eliminando = useRef(false)
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [reserva, setReserva] = useState(null)
  const [pagos, setPagos] = useState([])
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState(['pagos', 'mensaje'].includes(params.get('vista')) ? params.get('vista') : 'datos')
  const [cancelando, setCancelando] = useState(false)
  const [mensajes, setMensajes] = useState(null)
  const [cobrar, setCobrar] = useState(false)
  const [editor, setEditor] = useState(null)
  const [recordar, setRecordar] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [abrir, setAbrir] = useState(false)
  const [historial, setHistorial] = useState([])
  const [historialError, setHistorialError] = useState('')
  const [limite, setLimite] = useState(30)

  function recargar() { setRevision(v => v + 1) }
  useEffect(() => {
    let activo = true
    supabase.from('reserva_mensajes').select('tipo,enviado_el').eq('reserva_id', id).then(({ data, error }) => { if (activo) setMensajes(error ? null : data) })
    return () => { activo = false }
  }, [id, revision])
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
        if (cierreImportadoDisponible({ ...r.data, pagos: p.data || [] })) {
          navigate(`/nueva?cierre_id=${r.data.id}`, { replace: true }); return
        }
        setEditor(reservaDesdeCierre(r.data)); setParams({}, { replace: true })
      } else if (params.get('accion') === 'editar') {
        setEditor(r.data); setParams({}, { replace: true })
      }
    })
    return () => { active = false }
  }, [id, revision, params, setParams, navigate])

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
  function avanzar(paso) {
    if (paso.accion === 'editar') setEditor(reserva)
    else if (paso.accion === 'cobrar') {
      if (paso.abrir) setCobrar(true)
      else setTab('pagos')
    } else {
      setTab(paso.accion)
    }
  }
  async function reabrir() {
    if (guardando) return
    setGuardando(true); setError('')
    const { data, error: err } = await supabase.from('reservas').delete().eq('id', id).eq('estado', 'cerrada').in('canal_origen', ['directo', 'manual']).select('id').single()
    setGuardando(false)
    if (err || !data) { setError('No se pudo abrir el cierre manual.'); return }
    navigate('/calendario')
  }
  async function eliminarReserva() {
    if (guardando || eliminando.current) return
    eliminando.current = true
    try {
      if (!await confirmar('¿Eliminar esta reserva y todos sus registros de pago? Esta acción no se puede deshacer y no devuelve dinero al cliente.')) return
      setGuardando(true); setError('')
      const { error: err } = await supabase.rpc('eliminar_reserva_segura', { p_reserva_id: id })
      if (err) throw err
      navigate('/calendario')
    } catch {
      setError('No se eliminó la reserva ni sus pagos. Intentá nuevamente.')
    } finally { eliminando.current = false; setGuardando(false) }
  }
  if (loading) return <main className="cobros cobros-page"><p role="status">Cargando reserva…</p></main>
  if (!reserva) return <main className="cobros cobros-page"><p role="alert">{error}</p><button onClick={recargar}>Reintentar</button></main>
  if (editor) return <main className="cobros cobros-page"><CRUDReservas key={editor.id} reservaInicial={editor} onSaved={resultado => { setEditor(null); if (resultado?.clienteAsignado) { setTab('pagos'); if (resultado.tienePrecio) setCobrar(true) } recargar() }} onCancel={() => setEditor(null)} onDeleted={() => navigate('/calendario')} /></main>
  const cerrada = reserva.estado === 'cerrada'
  const manual = ['directo', 'manual'].includes(reserva.canal_origen)
  const plataforma = plataformas[reserva.canal_origen]
  const limpia = reserva.limpieza_completada_para === reserva.checkout
  const siguiente = proximaAccion(reserva, pagos, mensajes)
  const resumen = resumenCobros(reserva, pagos)
  const voucherDisponible = ['confirmada', 'finalizada'].includes(reserva.estado) && resumen.recibido > 0 && resumen.total !== null && !!reserva.clientes?.nombre
  const voucherEnviado = !!reserva.voucher_enviado_el || !!mensajes?.some(m => m.tipo === 'voucher' && m.enviado_el)
  return <main className="cobros cobros-page ficha-reserva">
    <header className="ficha-cabecera">
    <h1 className="ficha-titulo">{cerrada ? `Cierre ${manual ? 'manual' : reserva.canal_origen}` : nombreCliente(reserva)}</h1>
    <Link className="cobros-link" to="/calendario">Volver al calendario</Link>
    </header>
    <div className="ficha-identificacion"><p>{reserva.propiedades?.nombre} · {fecha(reserva.checkin)} → {fecha(reserva.checkout)}</p><p className={`ficha-estado ficha-estado-${reserva.estado}`}>{reserva.estado} · {manual ? 'Manual' : reserva.canal_origen}</p></div>
    {!cerrada && reserva.estado === 'pendiente' && <p className="reserva-fechas-ocupadas">Fechas ocupadas en el calendario · pendiente de confirmación</p>}
    <div className="cobros-acciones ficha-acciones"><button onClick={() => setEditor(reserva)}>Editar reserva</button>
      {voucherDisponible && <button onClick={() => setTab('mensaje')}>Ver voucher</button>}
      {!cerrada && <Link className="cobros-link" to={`/recibos?reserva_id=${reserva.id}`}>Recibos de pagos</Link>}
      {plataforma && <a className="cobros-link" href={plataforma.url} target="_blank" rel="noopener noreferrer" title={`Abrir el panel de ${plataforma.nombre} en una pestaña nueva`}>Abrir {plataforma.nombre}</a>}
      {cerrada && (cierreImportadoDisponible({ ...reserva, pagos })
        ? <Link className="cobros-link" to={`/nueva?cierre_id=${reserva.id}`}>Crear reserva dentro de este cierre</Link>
        : <button className="cobros-primary" onClick={() => setEditor(reservaDesdeCierre(reserva))}>Asignar inquilino</button>)}
      {cerrada && manual && <button onClick={() => setAbrir(true)}>Abrir cierre manual</button>}
      {!cerrada && reserva.estado !== 'cancelada' && <button className="cobros-danger" disabled={guardando} onClick={() => setCancelando(true)}>Cancelar reserva</button>}
      {!pagos.length && !mensajes?.length && <button className="cobros-danger" disabled={guardando} onClick={eliminarReserva}>Eliminar reserva</button>}
    </div>
    {cancelando && <CancelarReserva reserva={reserva} onClose={() => setCancelando(false)} onSaved={() => { setCancelando(false); setMensaje('Reserva cancelada. Se conservaron los registros de pago.'); recargar() }} />}
    {reserva.estado === 'cancelada' && <p className="cobros-aviso">Reserva cancelada{reserva.cancelacion_motivo ? `: ${reserva.cancelacion_motivo}` : ''}. Los pagos registrados se conservan.</p>}
    {!cerrada && tab !== 'pagos' && <dl className="ficha-importes" aria-label="Resumen de importes"><div><dt>Total estadía</dt><dd>{resumen.total === null ? 'Sin cargar' : dinero(resumen.total)}</dd></div><div><dt>Recibido</dt><dd>{dinero(resumen.recibido)}</dd></div><div><dt>{reserva.estado === 'cancelada' ? 'Saldo registrado' : 'Saldo pendiente'}</dt><dd>{resumen.saldo === null ? 'Sin calcular' : dinero(resumen.saldo)}</dd></div></dl>}
    {siguiente && <section className="ficha-proxima"><div><small>Próxima acción</small><p>{siguiente.texto}</p></div><div className="ficha-proxima-acciones"><button className="cobros-primary" onClick={() => avanzar(siguiente)}>{siguiente.boton}</button>{siguiente.tipo === 'voucher' && <button disabled={guardando} onClick={() => actualizar({ voucher_enviado_el: new Date().toISOString() })}>Ya lo envié</button>}</div></section>}
    {voucherDisponible && voucherEnviado && <p className="ficha-voucher-enviado">Voucher marcado como enviado <button disabled={guardando} onClick={() => mensajes?.some(m => m.tipo === 'voucher' && m.enviado_el) ? setTab('mensaje') : actualizar({ voucher_enviado_el: null })}>{mensajes?.some(m => m.tipo === 'voucher' && m.enviado_el) ? 'Ver envío' : 'Marcar pendiente'}</button></p>}
    {cobrar && <PagoRapido reservaId={id} onClose={() => { setCobrar(false); recargar() }} onSaved={recargar} />}
    {abrir && <div className="cobros-aviso"><p>¿Abrir este cierre manual? Estas fechas quedarán disponibles si no hay otro bloqueo.</p><div className="cobros-acciones"><button disabled={guardando} onClick={reabrir}>Abrir cierre</button><button onClick={() => setAbrir(false)}>Cancelar</button></div></div>}
    {error && <p role="alert" className="cobros-error">{error}</p>}
    {mensaje && <p role="status">{mensaje}</p>}
    <div className="cobros-tabs" aria-label="Secciones de la reserva">{Object.entries({ datos: 'Datos y tareas', ...(!cerrada ? { pagos: 'Pagos', recordatorio: 'Recordatorio', mensaje: 'Voucher' } : {}), historial: 'Historial' }).map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === 'datos' && <div className="ficha-datos">
      <dl><dt>Cliente</dt><dd>{nombreCliente(reserva)}</dd><dt>Teléfono</dt><dd>{reserva.clientes?.whatsapp || 'Sin teléfono'}</dd><dt>Huéspedes</dt><dd>{reserva.adultos || 0} adultos · {reserva.menores || 0} menores</dd><dt>Tipo de alquiler</dt><dd>{reserva.modalidad === 'mensual' ? 'Largo / mensual' : 'Temporal'}</dd></dl>
      {reserva.notas_internas && <section><h3>Notas internas</h3><p className="ficha-notas">{reserva.notas_internas}</p></section>}
      {!cerrada && reserva.canal_origen === 'booking' && <section><h3>Seguimiento de Booking</h3>
        <p>{reserva.booking_contactado_el ? `Contactado el ${fecha(reserva.booking_contactado_el)}` : `Contactar a partir del ${fecha(sumarDias(reserva.checkin, -30))}`}</p>
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
    {tab === 'mensaje' && !cerrada && <>{voucherDisponible && !voucherEnviado && siguiente?.tipo !== 'voucher' && <div className="ficha-voucher-pendiente"><span>Voucher pendiente de envío</span><button disabled={guardando} onClick={() => actualizar({ voucher_enviado_el: new Date().toISOString() })}>Ya lo envié</button></div>}<MensajesReserva key={id} reservaId={id} tipoInicial="voucher" soloVoucher onChange={recargar} /></>}
    {tab === 'historial' && <section><h3>Historial de cambios</h3>{historialError && <p role="alert">{historialError}</p>}{!historialError && !historial.length && <p>No hay cambios registrados todavía.</p>}<ul className="cobros-historial">{historial.map(h => <li key={h.id}><div><small>{new Date(h.registrado_at).toLocaleString('es-AR')} · {h.origen === 'ical' ? 'Sincronización iCal' : h.origen === 'automatico' ? 'Actualización automática' : 'App'}</small><p className="ficha-notas">{cambios(h)}</p></div></li>)}</ul>{historial.length === limite && <button onClick={() => setLimite(n => n + 30)}>Ver cambios anteriores</button>}</section>}
  </main>
}
