import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { leerListado } from '../lib/listados.js'
import { coincidenciasCliente } from '../lib/clientes-duplicados.js'

const campos = { nombre: 'Nombre', apellido: 'Apellido', dni: 'DNI', email: 'Email', whatsapp: 'Teléfono', domicilio: 'Domicilio', ciudad: 'Localidad', vehiculo_patente: 'Patente', notas: 'Notas' }
const nombre = c => [c.nombre, c.apellido].filter(Boolean).join(' ')
export default function RevisarClientes({ clienteId, onClose, onSaved }) {
  const dialog = useRef(null), lock = useRef(false)
  const [actual, setActual] = useState(null), [candidatos, setCandidatos] = useState([]), [destino, setDestino] = useState(null)
  const [reservas, setReservas] = useState([]), [datos, setDatos] = useState({}), [error, setError] = useState('')
  const [busy, setBusy] = useState(false), [acepta, setAcepta] = useState(false)
  useEffect(() => {
    dialog.current.showModal()
    let activo = true
    leerListado(() => supabase.from('clientes').select('*').order('id')).then(rows => {
      if (!activo) return
      const c = rows.find(c => c.id === clienteId)
      if (!c) throw new Error('El cliente no está disponible.')
      setActual(c); setCandidatos(coincidenciasCliente(c, rows))
    }).catch(() => { if (activo) setError('No se pudieron revisar los clientes. Cerrá y reintentá.') })
    return () => { activo = false }
  }, [clienteId])
  async function comparar(c) {
    if (busy) return
    setBusy(true); setError(''); setAcepta(false)
    try {
      const { data, error } = await supabase.from('clientes').select('*').in('id', [clienteId, c.id]).order('id')
      if (error || data.length !== 2) throw new Error('Los clientes cambiaron. Cerrá y reintentá.')
      const a = data.find(p => p.id === clienteId), b = data.find(p => p.id === c.id)
      const reservas = await leerListado(() => supabase.from('reservas').select('id,cliente_id,checkin,checkout,estado,propiedades(nombre)').in('cliente_id', [a.id, b.id]).order('checkin').order('id'))
      setActual(a); setDestino(b); setReservas(reservas)
      setDatos(Object.fromEntries(Object.keys(campos).map(k => [k, b[k] || a[k] || ''])))
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function unificar(e) {
    e.preventDefault()
    if (lock.current || !acepta) return
    lock.current = true; setBusy(true); setError('')
    try {
      const { error } = await supabase.rpc('unificar_clientes', { p_origen: actual.id, p_destino: destino.id, p_antes: { origen: actual, destino }, p_datos: datos })
      if (error) throw error
      onSaved({ ...destino, ...datos, es_repetidor: actual.es_repetidor || destino.es_repetidor })
    } catch (e) { setError(e.code === 'PGRST202' ? 'Falta activar la actualización de gestión en Supabase. No se modificaron clientes.' : e.message) }
    finally { lock.current = false; setBusy(false) }
  }
  return <dialog ref={dialog} className="cobros solicitudes-dialog" aria-label="Revisar clientes coincidentes" onCancel={e => { e.preventDefault(); if (!busy) onClose() }}><h2>Revisar coincidencias</h2>
    {actual && !destino && <><p>Datos guardados de <strong>{nombre(actual)}</strong></p>{!candidatos.length && <p>No hay coincidencias por nombre, DNI, email o teléfono.</p>}<ul className="cobros-historial">{candidatos.map(({ cliente, motivos }) => <li key={cliente.id}><div><strong>{nombre(cliente)}</strong><p>{motivos.join(' · ')} · DNI {cliente.dni || 'sin registrar'}</p></div><button disabled={busy} onClick={() => comparar(cliente)}>Comparar</button></li>)}</ul></>}
    {!actual && !error && <p role="status">Revisando clientes…</p>}
    {destino && <form onSubmit={unificar}><p>Se conservará el registro de <strong>{nombre(destino)}</strong>. Las reservas y solicitudes de ambos quedarán vinculadas a ese registro. Los pagos y mensajes guardados se conservan.</p><div className="pago-fields">{Object.entries(campos).filter(([key]) => actual[key] || destino[key]).map(([key, label]) => <label key={key}>{label}<select disabled={busy || (destino[key] || '') === (actual[key] || '')} value={datos[key]} onChange={e => { setDatos({ ...datos, [key]: e.target.value }); setAcepta(false) }}>{[...new Set([destino[key] || '', actual[key] || ''])].map(value => <option key={value} value={value}>{value || '(Vacío)'}</option>)}</select></label>)}</div>
      <details><summary>Reservas vinculadas ({reservas.length})</summary><ul>{reservas.map(r => <li key={r.id}>{r.propiedades?.nombre} · {r.checkin.split('-').reverse().join('/')} → {r.checkout.split('-').reverse().join('/')} · {r.estado}</li>)}</ul></details>
      <label className="cobros-check"><input type="checkbox" checked={acepta} onChange={e => setAcepta(e.target.checked)} disabled={busy} />Revisé los datos y confirmo que se trata de la misma persona.</label><div className="cobros-acciones"><button className="cobros-primary" disabled={busy || !acepta}>Unificar clientes</button><button type="button" disabled={busy} onClick={() => { setDestino(null); setAcepta(false) }}>Volver a coincidencias</button></div></form>}
    {error && <p role="alert" className="cobros-error">{error}</p>}<button disabled={busy} onClick={onClose}>Cerrar</button></dialog>
}
