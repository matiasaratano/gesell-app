import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { dinero, parseImporte } from '../lib/cobros.js'
import { hoyLocal, datosPago, pagoVacio } from '../lib/operacion-reserva.js'
import { detalleSolicitud, voucherSolicitud, fechaSolicitud, solicitudLista, vistaSolicitud } from '../lib/solicitudes.js'
import { revisarDisponibilidadSolicitud } from '../lib/disponibilidad-solicitud.js'
import '../components/cobros.css'
import './solicitudes.css'

const empty = () => ({ id: crypto.randomUUID(), propiedad_id: '', cliente_id: '', datos_cliente: { nombre: '', apellido: '', dni: '', whatsapp: '', email: '', domicilio: '', ciudad: '' }, checkin: '', checkout: '', adultos: 1, menores: 0, precio_total: '' })
async function filas(tabla, orden) {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(tabla).select('*').order(orden).order('id').range(offset, offset + 499)
    if (error) throw error
    rows.push(...data)
    if (data.length < 500) return rows
  }
}

export default function Solicitudes() {
  const [rows, setRows] = useState([]), [props, setProps] = useState([]), [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [mensaje, setMensaje] = useState('')
  const [tab, setTab] = useState('abierta'), [busqueda, setBusqueda] = useState(''), [editor, setEditor] = useState(null)
  const [cobrar, setCobrar] = useState(null), [texto, setTexto] = useState(null), [busy, setBusy] = useState(false)
  const [enlace, setEnlace] = useState(null)
  const [bloqueo, setBloqueo] = useState(null)
  const [cierresSeña, setCierresSeña] = useState(null)
  const [params, setParams] = useSearchParams()
  const solicitudId = params.get('solicitud')
  const lock = useRef(false)
  async function cargar() {
    setLoading(true); setError('')
    try {
      const solicitudes = await filas('solicitudes', 'checkin')
      const ids = solicitudes.filter(s => s.estado === 'confirmada' && s.reserva_id).map(s => s.reserva_id)
      const salidas = new Map()
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase.from('reservas').select('id,checkout').in('id', ids.slice(i, i + 100))
        if (error) throw error
        data.forEach(r => salidas.set(r.id, r.checkout))
      }
      const alojamientos = await filas('propiedades', 'nombre')
      const personas = await filas('clientes', 'nombre')
      setRows(solicitudes.map(s => ({ ...s, salida_reserva: salidas.get(s.reserva_id) }))); setProps(alojamientos); setClientes(personas)
    } catch (e) { setError(['42P01', 'PGRST205'].includes(e.code) ? 'Falta instalar la migración de Solicitudes en Supabase.' : `No se pudieron cargar las solicitudes. ${e.message || ''}`) }
    finally { setLoading(false) }
  }
  useEffect(() => { cargar() }, [])
  async function ejecutar(fn) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setMensaje('')
    try { await fn() } catch (e) {
      setMensaje('')
      if (e.code === 'FECHAS_OCUPADAS') setBloqueo({ mensaje: e.message, id: e.solicitudId })
      else setError(e.message || 'No se pudo completar la operación.')
    }
    finally { lock.current = false; setBusy(false) }
  }
  async function guardar(e) {
    e.preventDefault()
    const preparar = e.nativeEvent.submitter?.value === 'preparar'
    await ejecutar(async () => {
      const { id, updated_at, ...resto } = editor
      const payload = Object.fromEntries(['propiedad_id','checkin','checkout','adultos','menores','datos_cliente'].map(k => [k, resto[k]]))
      payload.cliente_id = resto.cliente_id || null
      payload.precio_total = parseImporte(resto.precio_total)
      if (!Number.isFinite(payload.precio_total) || payload.precio_total <= 0) throw new Error('Ingresá un precio válido.')
      if (payload.checkout <= payload.checkin) throw new Error('La salida debe ser posterior al ingreso.')
      if (!payload.datos_cliente.nombre?.trim()) throw new Error('Completá el nombre del cliente.')
      const query = updated_at
        ? supabase.from('solicitudes').update(payload).eq('id', id).eq('updated_at', updated_at).eq('estado', 'abierta')
        : supabase.from('solicitudes').insert({ ...payload, id })
      const { data, error: err } = await query.select('id').single()
      if (err || !data) throw new Error('No se pudo guardar. Actualizá el listado antes de reintentar; puede haber cambios en otra ventana.')
      setEditor(null); await cargar(); setMensaje('Solicitud guardada. Todavía no se creó una reserva.')
      if (preparar) setTexto(await prepararDetalle({ ...editor, ...payload }))
    })
  }
  async function archivar(s) {
    await ejecutar(async () => {
      const { data, error: err } = await supabase.from('solicitudes').update({ estado: s.estado === 'archivada' ? 'abierta' : 'archivada' }).eq('id',s.id).eq('updated_at',s.updated_at).select('id').single()
      if (err || !data) throw new Error('La solicitud cambió. Actualizá el listado.')
      await cargar()
    })
  }
  async function prepararDetalle(s) {
      if (!solicitudLista(s)) throw new Error('Asigná un departamento y un precio antes de preparar la seña.')
      const cierres = await revisarDisponibilidadSolicitud(supabase, s)
      const propiedad = props.find(p => p.id === s.propiedad_id)
      if (!propiedad?.alias_cbu) throw new Error('Completá el alias de cobro del alojamiento en Admin antes de preparar el detalle.')
      if (cierres.length) { setCierresSeña({ s, cierres, texto: detalleSolicitud(s, propiedad), propiedad }); return null }
      return detalleSolicitud(s, propiedad)
  }
  async function compartirFormulario() {
    await ejecutar(async () => {
      const { data, error } = await supabase.rpc('obtener_formulario_general')
      if (error) throw new Error(error.code === 'PGRST202' ? 'Falta ejecutar la migración de solicitudes públicas en Supabase.' : 'No se pudo obtener el enlace del formulario. Intentá nuevamente.')
      setEnlace(`${window.location.origin}/consulta/${data}`)
    })
  }
  async function voucher(s) {
    await ejecutar(async () => {
      const { data, error } = await supabase.from('reservas').select('*, clientes(*), propiedades(*), pagos(*)').eq('id', s.reserva_id).single()
      if (error) throw new Error('No se pudo cargar la reserva para generar su confirmación.')
      setTexto(voucherSolicitud(data))
    })
  }
  const hoy = hoyLocal()
  const visibles = rows.filter(s => vistaSolicitud(s, hoy) === tab && (!solicitudId || s.id === solicitudId) && `${s.datos_cliente.nombre} ${s.datos_cliente.apellido || ''} ${props.find(p=>p.id===s.propiedad_id)?.nombre || ''}`.toLocaleLowerCase().includes(busqueda.toLocaleLowerCase()))
  return <main className="cobros cobros-page solicitudes">
    <header className="solicitudes-cabecera"><h1>Solicitudes</h1><div className="cobros-acciones"><button className="cobros-primary" disabled={busy} onClick={compartirFormulario}>Compartir formulario</button><button disabled={busy || loading} onClick={cargar}>Actualizar</button><button disabled={busy || loading} onClick={() => setEditor(empty())}>Nueva solicitud</button></div></header>
    <p className="cobros-aviso">Sin bloqueo de fechas hasta confirmar el pago recibido. Booking y Airbnb se actualizan por separado.</p>
    {error && <p role="alert" className="cobros-error">{error}</p>}{mensaje && <p role="status">{mensaje}</p>}
    <div className="cobros-tabs" aria-label="Estado de solicitudes">{Object.entries({ abierta: 'Abiertas', confirmada: 'Confirmadas', archivada: 'Archivadas', eliminada: 'Eliminadas' }).map(([value,label]) => <button key={value} aria-pressed={tab===value} onClick={()=>{setTab(value);setParams({})}}>{label} ({rows.filter(s=>vistaSolicitud(s,hoy)===value).length})</button>)}</div>
    {solicitudId && <div className="cobros-acciones"><button onClick={()=>{setParams({});setBusqueda('')}}>Ver todas las solicitudes</button></div>}
    <label className="solicitudes-busqueda">Buscar solicitud<input type="search" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Cliente o departamento" /></label>
    {loading ? <p role="status">Cargando solicitudes…</p> : <ul className="cobros-lista">{visibles.map(s => <li key={s.id}><div><strong>{s.datos_cliente.nombre} {s.datos_cliente.apellido}</strong><p>{props.find(p=>p.id===s.propiedad_id)?.nombre || 'Sin departamento'} · {fechaSolicitud(s.checkin)} → {fechaSolicitud(s.checkout)} · {Number(s.precio_total)>0 ? dinero(s.precio_total) : 'Precio pendiente'}</p>{s.datos_recibidos_at && <small>Datos recibidos del huésped</small>}</div><div className="cobros-acciones">
      {s.estado==='eliminada' ? <span>Reserva eliminada</span> : s.estado==='confirmada' ? <><Link className="cobros-link" to={`/reservas/${s.reserva_id}`}>Ver reserva</Link><button disabled={busy} onClick={()=>voucher(s)}>Voucher de confirmación</button></> : s.estado==='archivada' ? <button disabled={busy} onClick={()=>archivar(s)}>Reactivar</button> : <>
        <button className={!solicitudLista(s) ? 'cobros-primary' : ''} disabled={busy} onClick={()=>setEditor(structuredClone(s))}>{solicitudLista(s) ? 'Datos' : 'Asignar departamento y precio'}</button>{solicitudLista(s) && <><button disabled={busy} onClick={()=>ejecutar(async()=>setTexto(await prepararDetalle(s)))}>Detalle para seña</button><button className="cobros-primary" disabled={busy} onClick={()=>setCobrar(s)}>Confirmar pago</button></>}<button disabled={busy} onClick={()=>archivar(s)}>Archivar</button>
      </>}</div></li>)}</ul>}
    {!loading && !visibles.length && <p>No hay solicitudes en esta vista.</p>}
    {bloqueo && <Dialog titulo="No se puede solicitar la seña" cerrar={()=>setBloqueo(null)}><p role="alert">{bloqueo.mensaje}</p><div className="cobros-acciones"><button className="cobros-primary" onClick={()=>{const s=rows.find(s=>s.id===bloqueo.id);if(s)setEditor(structuredClone(s));setBloqueo(null)}}>Revisar solicitud</button><button onClick={()=>setBloqueo(null)}>Cerrar</button></div></Dialog>}
    {cierresSeña && <Dialog titulo="Fechas cerradas en la plataforma" cerrar={()=>setCierresSeña(null)}><p><strong>{cierresSeña.propiedad.nombre}</strong> · {fechaSolicitud(cierresSeña.s.checkin)} → {fechaSolicitud(cierresSeña.s.checkout)}</p><DetalleCierres cierres={cierresSeña.cierres} /><p>Podés preparar una reserva directa si estos cierres son preventivos. Las fechas no cambian hasta que confirmes el pago. Booking y Airbnb seguirán bajo tu gestión manual.</p><div className="cobros-acciones"><button className="cobros-primary" onClick={()=>{setTexto(cierresSeña.texto);setCierresSeña(null)}}>Preparar seña sobre estos cierres</button><button onClick={()=>setCierresSeña(null)}>Cancelar</button></div></Dialog>}
    {editor && <Dialog titulo={editor.updated_at ? 'Datos de la solicitud' : 'Nueva solicitud'} cerrar={()=>!busy && setEditor(null)}>
      <form onSubmit={guardar}><div className="pago-fields">
        <label>Departamento<select aria-label="Departamento" required value={editor.propiedad_id || ''} onChange={e=>setEditor({...editor,propiedad_id:e.target.value})}><option value="">Elegir</option>{props.filter(p=>p.activa!==false || p.id===editor.propiedad_id).map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
        <label>Precio total<input required inputMode="decimal" value={editor.precio_total ?? ''} onChange={e=>setEditor({...editor,precio_total:e.target.value})} /></label>
        {['checkin','checkout'].map(k=><label key={k}>{k==='checkin'?'Ingreso':'Salida'}<input required type="date" value={editor[k]} onChange={e=>setEditor({...editor,[k]:e.target.value})} /></label>)}
        {['adultos','menores'].map(k=><label key={k}>{k==='adultos'?'Adultos':'Menores'}<input required type="number" min={k==='adultos'?1:0} value={editor[k]} onChange={e=>setEditor({...editor,[k]:Number(e.target.value)})} /></label>)}
      </div><h3>Cliente</h3><label>Usar cliente existente<select value={editor.cliente_id || ''} onChange={e=>{const c=clientes.find(c=>c.id===e.target.value);setEditor({...editor,cliente_id:e.target.value,datos_cliente:c ? Object.fromEntries(['nombre','apellido','dni','email','whatsapp','domicilio','ciudad'].map(k=>[k,c[k]||''])) : empty().datos_cliente})}}><option value="">Nuevo cliente</option>{clientes.map(c=><option key={c.id} value={c.id}>{c.nombre} {c.apellido} · {c.dni || 'Sin DNI'}</option>)}</select></label>
      <div className="pago-fields">{Object.entries({nombre:'Nombre',apellido:'Apellido',dni:'DNI',whatsapp:'Teléfono',email:'Email',domicilio:'Domicilio',ciudad:'Localidad'}).map(([key,label])=><label key={key}>{label}<input required={key==='nombre'} type={key==='email'?'email':'text'} disabled={!!editor.cliente_id} value={editor.datos_cliente[key]||''} onChange={e=>setEditor({...editor,datos_cliente:{...editor.datos_cliente,[key]:e.target.value}})} /></label>)}</div>
      {error && <p role="alert" className="cobros-error">{error}</p>}<div className="cobros-acciones"><button className="cobros-primary" value="preparar" disabled={busy}>Guardar y preparar seña</button><button disabled={busy}>{editor.updated_at ? 'Guardar cambios' : 'Guardar solicitud'}</button><button type="button" disabled={busy} onClick={()=>setEditor(null)}>Cancelar</button></div></form>
    </Dialog>}
    {enlace && <Dialog titulo="Compartir formulario" cerrar={()=>setEnlace(null)}><label>Enlace para huéspedes<input readOnly value={enlace} onFocus={e=>e.target.select()} /></label>{['localhost','127.0.0.1'].includes(window.location.hostname)&&<p className="cobros-aviso">Estás en la app local. Para compartirlo con un huésped, copiá el enlace desde la app publicada.</p>}<div className="cobros-acciones"><button className="cobros-primary" onClick={()=>navigator.clipboard.writeText(enlace).then(()=>setMensaje('Enlace copiado')).catch(()=>setMensaje('No se pudo copiar. Seleccioná el enlace.'))}>Copiar enlace</button><a className="cobros-link" href={enlace} target="_blank" rel="noopener noreferrer">Ver formulario</a><button onClick={()=>setEnlace(null)}>Cerrar</button></div><p role="status">{mensaje}</p></Dialog>}
    {texto!==null && <Dialog titulo="Mensaje para el huésped" cerrar={()=>setTexto(null)}><textarea aria-label="Texto del mensaje" value={texto} onChange={e=>setTexto(e.target.value)} rows={12} /><div className="cobros-acciones"><button onClick={()=>navigator.clipboard.writeText(texto).then(()=>setMensaje('Mensaje copiado')).catch(()=>setMensaje('No se pudo copiar. Seleccioná el texto del mensaje.'))}>Copiar texto</button><button onClick={()=>setTexto(null)}>Cerrar</button></div><p role="status">{mensaje}</p></Dialog>}
    {cobrar && <Confirmar s={cobrar} cerrar={()=>setCobrar(null)} onSaved={async ()=>{setCobrar(null);await cargar();setMensaje('Pago registrado y reserva confirmada. Recordá cerrar las fechas en Booking y Airbnb.');setTab('confirmada')}} />}
  </main>
}
function Dialog({ titulo, cerrar, children }) {
  const ref = useRef(null)
  useEffect(()=>{ref.current.showModal()},[])
  return <dialog ref={ref} className="cobros solicitudes-dialog" aria-label={titulo} onCancel={e=>{e.preventDefault();cerrar()}}><h2>{titulo}</h2>{children}</dialog>
}
function Confirmar({s,cerrar,onSaved}) {
  const [pago,setPago]=useState(()=>({...pagoVacio(),monto:String(Math.round(Number(s.precio_total)*30)/100)}))
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [cierres,setCierres]=useState(null),[autoriza,setAutoriza]=useState(false)
  const id=useRef(crypto.randomUUID()),lock=useRef(false)
  async function guardar(e) {
    e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('')
    try {
      const payload=datosPago(pago,id.current)
      const vigente=await supabase.from('solicitudes').select('estado,reserva_id').eq('id',s.id).single()
      if (vigente.error) throw new Error('No se pudo verificar la solicitud. Reintentá antes de registrar el pago.')
      if (vigente.data?.estado==='confirmada' && vigente.data.reserva_id) { await onSaved(vigente.data.reserva_id);return }
      const actuales=await revisarDisponibilidadSolicitud(supabase,s)
      if (actuales.length && (!autoriza || JSON.stringify(actuales)!==JSON.stringify(cierres))) {
        setCierres(actuales);setAutoriza(false);return
      }
      const {data,error:err}=await supabase.rpc(actuales.length?'confirmar_solicitud_sobre_cierres':'confirmar_solicitud',{p_id:s.id,p_version:s.updated_at,p_pago:payload,...(actuales.length?{p_cierres:actuales}:{})})
      if (err?.code==='PGRST202') throw new Error('Falta ejecutar la actualización SQL para confirmar sobre cierres importados.')
      if(err || !data) throw err || new Error('No se recibió confirmación. Podés reintentar sin duplicar el pago.')
      await onSaved(data)
    } catch(e){setError(/ocupadas|cierre manual/i.test(e.message || '') ? 'No se confirmó la reserva ni se registró el pago: las fechas están ocupadas. Cerrá esta ventana y revisá el departamento y las fechas de la solicitud.' : e.message)} finally {lock.current=false;setBusy(false)}
  }
  return <Dialog titulo="Confirmar pago recibido" cerrar={()=>!busy&&cerrar()}><p>{s.datos_cliente.nombre} · Total {dinero(s.precio_total)}</p><p>Al confirmar se registrará el pago y se ocuparán las fechas en la app.</p><form onSubmit={guardar}><div className="pago-fields">
    <label>Concepto<select value={pago.tipo} onChange={e=>setPago({...pago,tipo:e.target.value,monto:e.target.value==='total'?String(s.precio_total):pago.monto})}><option value="seña">Seña</option><option value="total">Pago total</option></select></label>
    <label>Importe recibido<input required inputMode="decimal" value={pago.monto} onChange={e=>setPago({...pago,monto:e.target.value})} /></label>
    <label>Fecha del cobro<input required type="date" max={hoyLocal()} value={pago.fecha_recibido} onChange={e=>setPago({...pago,fecha_recibido:e.target.value})} /></label>
    <label>Medio de pago<select value={pago.metodo} onChange={e=>setPago({...pago,metodo:e.target.value})}><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="otro">Otro</option></select></label>
  </div><label className="cobros-check"><input type="checkbox" required />Verifiqué que recibí este pago.</label>{cierres && <div className="cobros-aviso"><p>Reserva directa: {fechaSolicitud(s.checkin)} → {fechaSolicitud(s.checkout)}</p><DetalleCierres cierres={cierres} /><label className="cobros-check"><input type="checkbox" checked={autoriza} onChange={e=>setAutoriza(e.target.checked)} />Son cierres preventivos: autorizo reservar sobre estos cierres.</label><p>Las noches restantes seguirán cerradas. No se modifica Booking ni Airbnb.</p></div>}{error&&<p role="alert" className="cobros-error">{error}</p>}<div className="cobros-acciones"><button className="cobros-primary" disabled={busy}>Confirmar pago y reserva</button><button type="button" disabled={busy} onClick={cerrar}>Cancelar</button></div></form></Dialog>
}
function DetalleCierres({cierres}) {
  return <ul>{cierres.map(r=><li key={r.id}>{r.canal_origen==='booking'?'Booking':'Airbnb'} · {fechaSolicitud(r.checkin)} → {fechaSolicitud(r.checkout)}</li>)}</ul>
}
