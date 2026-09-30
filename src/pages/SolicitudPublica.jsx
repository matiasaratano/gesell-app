import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fechaSolicitud } from '../lib/solicitudes.js'
import { hoyLocal } from '../lib/operacion-reserva.js'
import { errorFormulario } from '../lib/error-formulario.js'
import '../components/cobros.css'
import './solicitudes.css'

const campos = { nombre: 'Nombre', apellido: 'Apellido', dni: 'DNI o pasaporte', whatsapp: 'Teléfono', email: 'Email', domicilio: 'Domicilio', ciudad: 'Localidad' }
export default function SolicitudPublica({ general = false }) {
  const { token } = useParams()
  const [info, setInfo] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false), [enviado, setEnviado] = useState(false)
  const envio = useRef(crypto.randomUUID()), lock = useRef(false)
  useEffect(() => {
    let activo = true
    setLoading(true); setInfo(null); setError(''); setEnviado(false)
    envio.current = crypto.randomUUID()
    if (general) {
      try {
        envio.current = sessionStorage.getItem(`solicitud-envio:${token}`) || envio.current
        sessionStorage.setItem(`solicitud-envio:${token}`, envio.current)
      } catch { /* En modo privado se conserva el identificador en memoria. */ }
    }
    supabase.rpc(general ? 'ver_formulario_general' : 'ver_formulario_solicitud', { p_token: token }).then(({ data, error }) => {
      if (!activo) return
      if (error || !data) setError('El enlace venció, ya fue utilizado o no está disponible. Pedinos uno nuevo.')
      else setInfo(data)
    }).catch(() => { if (activo) setError('No se pudo cargar el formulario. Intentá nuevamente.') })
      .finally(() => { if (activo) setLoading(false) })
    return () => { activo = false }
  }, [token, general])
  async function enviar(e) {
    e.preventDefault(); if (lock.current) return
    const form = new FormData(e.currentTarget)
    const datos = Object.fromEntries(Object.keys(campos).map(k => [k, String(form.get(k) || '').trim()]))
    const estadia = general ? { checkin: form.get('checkin'), checkout: form.get('checkout'), adultos: Number(form.get('adultos')), menores: Number(form.get('menores')) } : null
    if (general && estadia.checkout <= estadia.checkin) { setError('La salida debe ser posterior al ingreso.'); return }
    lock.current = true
    setBusy(true); setError('')
    try {
      const { error } = await supabase.rpc(general ? 'recibir_solicitud_publica' : 'enviar_formulario_solicitud', { p_token: token, p_datos: datos, ...(general ? { p_envio: envio.current, p_estadia: estadia } : {}) })
      if (error) { setError(errorFormulario(error)); return }
      if (general) { try { sessionStorage.removeItem(`solicitud-envio:${token}`) } catch { /* No impide confirmar el envio. */ } }
      setEnviado(true)
    } catch (e) { setError(e.message || 'No se pudo conectar. Intentá nuevamente.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <main className="cobros cobros-page solicitud-publica"><h1>Solicitud de reserva</h1>
    {loading ? <p role="status">Cargando…</p> : enviado ? <div role="status"><h2>Datos enviados</h2><p>Revisaremos la disponibilidad y te contactaremos con el detalle para la seña. Las fechas todavía no están reservadas.</p></div> : info && <>
      {!general && <><h2>{info.alojamiento}</h2><p>{fechaSolicitud(info.checkin)} al {fechaSolicitud(info.checkout)} · {info.adultos} adultos · {info.menores} menores</p></>}
      <p>Completar este formulario no confirma la reserva ni bloquea las fechas.</p>
      <form key={token} onSubmit={enviar}>
      {general && <><h2>Estadía</h2><div className="pago-fields">
        <label>Ingreso<input name="checkin" type="date" min={hoyLocal()} required /></label>
        <label>Salida<input name="checkout" type="date" min={hoyLocal()} required /></label>
        <label>Adultos<input name="adultos" type="number" min="1" max="30" defaultValue="2" required /></label>
        <label>Menores<input name="menores" type="number" min="0" max="30" defaultValue="0" required /></label>
      </div><h2>Datos de contacto</h2></>}
      <div className="pago-fields">{Object.entries(campos).map(([key, label]) => <label key={key}>{label}{['domicilio','ciudad'].includes(key) ? ' (opcional)' : ''}<input name={key} required={!['domicilio','ciudad'].includes(key)} maxLength={key === 'email' ? 254 : 150} type={key === 'email' ? 'email' : key === 'whatsapp' ? 'tel' : 'text'} autoComplete={{nombre:'given-name',apellido:'family-name',email:'email',whatsapp:'tel',domicilio:'street-address',ciudad:'address-level2'}[key]} /></label>)}</div>
      <label className="cobros-check"><input type="checkbox" required />Acepto que utilicen estos datos para gestionar mi solicitud y contactarme.</label>
      <button className="cobros-primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar datos'}</button></form>
    </>}
    {error && <p role="alert" className="cobros-error">{error}</p>}
  </main>
}
