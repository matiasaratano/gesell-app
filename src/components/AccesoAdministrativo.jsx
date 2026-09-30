import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './cobros.css'
import '../pages/solicitudes.css'

export default function AccesoAdministrativo({ children }) {
  const [sesion, setSesion] = useState(undefined)
  const [autorizado, setAutorizado] = useState(false)
  const [comprobando, setComprobando] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const userId = sesion?.user?.id
  useEffect(() => {
    let activo = true
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { if (activo) setSesion(session) })
    supabase.auth.getSession().then(({ data, error }) => {
      if (activo) { setSesion(data.session); if (error) setError('No se pudo recuperar la sesión.') }
    }).catch(() => { if (activo) setSesion(null) })
    return () => { activo = false; data.subscription.unsubscribe() }
  }, [])
  useEffect(() => {
    let activo = true
    setAutorizado(false)
    if (!userId) { setComprobando(false); return }
    setComprobando(true)
    supabase.rpc('es_administrador').then(({ data, error }) => {
      if (!activo) return
      setAutorizado(data === true && !error ? userId : false)
      setError(error ? 'Falta configurar el acceso administrativo en Supabase o no se pudo verificar. Recargá para reintentar.' : data === true ? '' : 'Esta cuenta no tiene acceso administrativo. Agregala a administradores en Supabase.')
      setComprobando(false)
    }).catch(() => { if (activo) { setError('No se pudo verificar el acceso. Recargá para reintentar.'); setComprobando(false) } })
    return () => { activo = false }
  }, [userId])
  async function entrar(e) {
    e.preventDefault(); setBusy(true); setError('')
    const form = new FormData(e.currentTarget)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: form.get('email').trim(), password: form.get('password') })
      if (error) setError('No se pudo iniciar sesión. Revisá el correo y la contraseña.')
    } catch { setError('No se pudo conectar. Intentá nuevamente.') }
    finally { setBusy(false) }
  }
  async function salir() {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) setError('No se pudo cerrar la sesión. Intentá nuevamente.')
  }
  if (sesion === undefined || comprobando) return <main className="cobros cobros-page"><p role="status">Verificando acceso…</p></main>
  if (sesion && autorizado === userId) return <div key={sesion.user.id}>{children({ salir, email: sesion.user.email })}{error && <p role="alert">{error}</p>}</div>
  return <main className="cobros acceso-pagina"><section className="acceso-panel"><h1>Administración</h1>{!sesion ? <form onSubmit={entrar} className="solicitudes-acceso">
    <label>Correo<input name="email" type="email" autoComplete="username" required /></label>
    <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
    <button className="cobros-primary" disabled={busy}>Ingresar</button>
  </form> : <button onClick={salir}>Usar otra cuenta</button>}{error && <p role="alert" className="cobros-error">{error}</p>}</section></main>
}
