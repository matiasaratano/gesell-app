import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { leerListado } from '../lib/listados.js'
import { snapshotMensaje, textoMensajeReserva } from '../lib/mensajes-reserva.js'

export default function MensajesReserva({ reservaId, tipoInicial = 'detalle', soloVoucher = false, onChange }) {
  const [tipo, setTipo] = useState(tipoInicial === 'voucher' ? 'voucher' : 'detalle')
  const [texto, setTexto] = useState(''), [snapshot, setSnapshot] = useState(null), [historial, setHistorial] = useState([])
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [mensaje, setMensaje] = useState('')
  const lock = useRef(false), intento = useRef(crypto.randomUUID())
  useEffect(() => {
    let activo = true
    leerListado(() => supabase.from('reserva_mensajes').select('*').eq('reserva_id', reservaId).order('creado_el', { ascending: false }).order('id')).then(data => { if (activo) setHistorial(data) }).catch(() => { /* La generacion sigue disponible antes de activar el historial. */ })
    return () => { activo = false }
  }, [reservaId])
  async function generar() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setMensaje('')
    try {
      const { data, error } = await supabase.from('reservas').select('*, clientes(*), propiedades(*), pagos(*)').eq('id', reservaId).single()
      if (error || !data) throw new Error('No se pudo actualizar la reserva. Reintentá.')
      setTexto(textoMensajeReserva(data, tipo)); setSnapshot(snapshotMensaje(data)); intento.current = crypto.randomUUID()
    } catch (e) { setError(e.message) }
    finally { lock.current = false; setBusy(false) }
  }
  async function guardar() {
    if (lock.current || !snapshot || !texto.trim()) return
    lock.current = true; setBusy(true); setError(''); setMensaje('')
    try {
      const { error } = await supabase.rpc('guardar_mensaje_reserva', { p_id: intento.current, p_reserva: reservaId, p_tipo: tipo, p_texto: texto.trim(), p_datos: snapshot })
      if (error) throw error
      const data = await leerListado(() => supabase.from('reserva_mensajes').select('*').eq('reserva_id', reservaId).order('creado_el', { ascending: false }).order('id'))
      setHistorial(data); setMensaje('Versión guardada. Podés marcarla como enviada cuando la compartas.'); onChange?.()
    } catch (e) { setError(e.code === 'PGRST202' || e.code === '42P01' ? 'El texto está listo para copiar. Para guardar el historial falta activar la actualización de gestión en Supabase.' : e.message) }
    finally { lock.current = false; setBusy(false) }
  }
  async function copiar(value) {
    try { await navigator.clipboard.writeText(value); setMensaje('Mensaje copiado.') }
    catch { setError('No se pudo copiar. Seleccioná el texto del mensaje.') }
  }
  async function marcar(m) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const enviado_el = m.enviado_el ? null : new Date().toISOString()
      const { data, error } = await supabase.from('reserva_mensajes').update({ enviado_el }).eq('id', m.id).eq('reserva_id', reservaId).select('id,enviado_el').single()
      if (error || !data) throw new Error('No se pudo actualizar el envío.')
      setHistorial(rows => rows.map(r => r.id === data.id ? { ...r, enviado_el: data.enviado_el } : r)); onChange?.()
    } catch (e) { setError(e.message) }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="cobros mensajes-reserva"><h3>{soloVoucher ? 'Voucher de confirmación' : 'Mensajes de esta reserva'}</h3><div className="mensajes-preparacion">{!soloVoucher && <label>Tipo de mensaje<select value={tipo} disabled={busy} onChange={e => { setTipo(e.target.value); setTexto(''); setSnapshot(null); setError(''); intento.current = crypto.randomUUID() }}><option value="detalle">Detalle para el huésped</option><option value="voucher">Voucher de confirmación</option></select></label>}<button className="cobros-primary" disabled={busy} onClick={generar}>{busy ? 'Preparando…' : 'Generar con datos actuales'}</button>{soloVoucher && <Link className="cobros-link" to={`/mensajes?reserva_id=${reservaId}&tipo=voucher`}>Abrir en Mensajes</Link>}</div>
    {texto && <><label>Mensaje para WhatsApp<textarea aria-label="Mensaje para WhatsApp" rows={12} value={texto} onChange={e => { setTexto(e.target.value); intento.current = crypto.randomUUID() }} disabled={busy} /></label><div className="cobros-acciones"><button disabled={busy} onClick={() => copiar(texto)}>Copiar mensaje</button><button disabled={busy} onClick={guardar}>Guardar versión</button><a className="cobros-link" href={`https://wa.me/${String(snapshot?.cliente?.whatsapp || '').replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a></div></>}
    {error && <p role="alert" className="cobros-error">{error}</p>}{mensaje && <p role="status">{mensaje}</p>}
    <h3>Versiones guardadas</h3>{!historial.length && <p>No hay mensajes guardados.</p>}<ul className="cobros-historial">{historial.map(m => <li key={m.id}><div><strong>{m.tipo === 'voucher' ? 'Voucher' : 'Detalle'}</strong><small> · {new Date(m.creado_el).toLocaleString('es-AR', { hour12: false })}</small><p>{m.enviado_el ? `Enviado el ${new Date(m.enviado_el).toLocaleString('es-AR', { hour12: false })}` : 'Pendiente de envío'}</p><details><summary>Ver texto guardado</summary><p className="ficha-notas">{m.texto}</p></details><div className="cobros-acciones"><button disabled={busy} onClick={() => copiar(m.texto)}>Copiar texto guardado</button><button disabled={busy} onClick={() => marcar(m)}>{m.enviado_el ? 'Marcar como pendiente' : 'Marcar como enviado'}</button></div></div></li>)}</ul><Link to={`/recibos?reserva_id=${reservaId}`}>Recibos de pagos</Link></section>
}
