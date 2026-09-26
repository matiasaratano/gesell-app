import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { dinero, nombreCliente, normalizarBusqueda } from '../lib/cobros.js'
import { datosReciboPago } from '../lib/recibo-pago.js'

const fecha = v => v?.slice(0, 10).split('-').reverse().join('/') || 'Sin fecha'

export default function SeleccionRecibo({ renderRecibo }) {
  const [params, setParams] = useSearchParams()
  const [reservas, setReservas] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const comprobando = useRef(false)
  const [verificando, setVerificando] = useState(false)
  const reservaId = params.get('reserva_id') || ''
  const pagoId = params.get('pago_id') || ''
  useEffect(() => {
    let activo = true
    setCargando(true); setError('')
    async function cargar() {
      const filas = []
      for (let offset = 0; ; offset += 500) {
        const { data, error: err } = await supabase.from('reservas').select('*, clientes(*), propiedades(*), pagos(*)')
          .neq('estado', 'cerrada').order('checkin', { ascending: false }).order('id').range(offset, offset + 499)
        if (err) throw err
        filas.push(...data)
        if (data.length < 500) break
      }
      if (activo) setReservas(filas)
    }
    cargar().catch(() => { if (activo) setError('No se pudieron cargar las reservas y los pagos.') })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [revision])
  const reserva = reservas.find(r => r.id === reservaId)
  const pagos = (reserva?.pagos || []).filter(p => p.confirmado === true && Number(p.monto) > 0)
    .sort((a, b) => (b.fecha_recibido || '').localeCompare(a.fecha_recibido || ''))
  const pago = pagos.find(p => p.id === pagoId)
  const { faltantes } = datosReciboPago(reserva, pago)
  const opciones = reservas.filter(r => r.id === reservaId || normalizarBusqueda(`${nombreCliente(r)} ${r.clientes?.dni || ''} ${r.propiedades?.nombre || ''} ${r.checkin}`).includes(normalizarBusqueda(busqueda)))
  function elegirReserva(id) { setParams(id ? { reserva_id: id } : {}) }
  async function verificar() {
    if (comprobando.current) return false
    comprobando.current = true; setVerificando(true); setError('')
    try {
      const { data, error: err } = await supabase.from('reservas').select('*, clientes(*), propiedades(*), pagos(*)').eq('id', reservaId).single()
      if (err || !data) throw err || new Error('Reserva no disponible')
      const actual = data.pagos?.find(p => p.id === pagoId)
      if (JSON.stringify(datosReciboPago(data, actual)) !== JSON.stringify(datosReciboPago(reserva, pago)) || JSON.stringify(data.propiedades) !== JSON.stringify(reserva.propiedades)) {
        setReservas(prev => prev.map(r => r.id === data.id ? data : r))
        setError('Los datos cambiaron. Revisá el recibo actualizado antes de emitirlo.')
        return false
      }
      return datosReciboPago(data, actual).faltantes.length === 0
    } catch { setError('No se pudo verificar el pago. No se emitió el recibo; volvé a intentar.'); return false }
    finally { comprobando.current = false; setVerificando(false) }
  }
  return <>
    <section className="cobros recibo-selector print-hide" aria-label="Elegir reserva y pago">
      <label>Buscar reserva<input type="search" placeholder="Cliente, DNI, departamento o fecha" value={busqueda} onChange={e => setBusqueda(e.target.value)} /></label>
      {cargando ? <p role="status">Cargando reservas…</p> : <>
        <label>Reserva<select aria-label="Reserva" value={reservaId} onChange={e => elegirReserva(e.target.value)}><option value="">Elegí una reserva</option>
          {opciones.map(r => <option key={r.id} value={r.id}>{nombreCliente(r)} · {r.propiedades?.nombre} · {fecha(r.checkin)} → {fecha(r.checkout)}</option>)}
        </select></label>
        {!opciones.length && <p>No se encontraron reservas.</p>}
        {reservaId && !reserva && <p role="alert">La reserva no está disponible.</p>}
        {reserva && <><Link to={`/reservas/${reserva.id}?vista=pagos`}>Ver reserva y pagos</Link>
          <label>Pago recibido<select aria-label="Pago recibido" value={pagoId} onChange={e => setParams({ reserva_id: reservaId, ...(e.target.value ? { pago_id: e.target.value } : {}) })}>
            <option value="">Elegí el pago del recibo</option>{pagos.map(p => <option key={p.id} value={p.id}>{fecha(p.fecha_recibido)} · {p.tipo} · {dinero(p.monto)}{p.periodo_mes ? ` · Mes ${p.periodo_mes.slice(0, 7)}` : ''}</option>)}
          </select></label>
          {!pagos.length && <p>No hay pagos recibidos y contabilizados. <Link to={`/reservas/${reserva.id}?vista=pagos`}>Registrar pago</Link></p>}
          {pagoId && !pago && <p role="alert">Ese pago no está disponible o fue anulado. No se puede emitir su recibo.</p>}
        </>}
      </>}
      {error && <p role="alert" className="cobros-error">{error}</p>}
      <button onClick={() => setRevision(v => v + 1)} disabled={cargando || verificando}>Actualizar datos</button>
      {!cargando && reserva && pago && faltantes.length > 0 && <section className="recibo-faltantes"><h2>Completá estos datos para generar el recibo</h2>
        <ul>{faltantes.map(f => <li key={f}>{f}</li>)}</ul>
        <div className="cobros-acciones"><Link className="cobros-link" to={`/reservas/${reserva.id}?accion=editar`}>Editar reserva</Link>
          <Link className="cobros-link" to="/admin?seccion=propiedades">Editar alojamiento</Link></div>
        {reserva.cliente_id && <CompletarCliente key={`${reserva.id}-${revision}`} reserva={reserva} onSaved={() => setRevision(v => v + 1)} />}
        {(!pago.fecha_recibido || !pago.metodo || !pago.tipo || (pago.tipo === 'mensualidad' && !pago.periodo_mes)) && <CompletarPago key={pago.id} pago={pago} onSaved={() => setRevision(v => v + 1)} />}
      </section>}
    </section>
    {!cargando && reserva && pago && !faltantes.length && renderRecibo(reserva, pago, verificar, verificando)}
  </>
}

function CompletarCliente({ reserva, onSaved }) {
  const [campos, setCampos] = useState(() => Object.fromEntries(['nombre', 'apellido', 'dni', 'domicilio', 'ciudad'].map(k => [k, reserva.clientes?.[k] || ''])))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  async function guardar(e) {
    e.preventDefault(); if (guardando) return
    setGuardando(true); setError('')
    try {
      const { data, error: err } = await supabase.from('clientes').update(Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v.trim()])))
        .eq('id', reserva.cliente_id).select('id').single()
      if (err || !data) throw err || new Error('Sin cambios')
      onSaved()
    } catch { setError('No se pudieron guardar los datos del cliente.') }
    finally { setGuardando(false) }
  }
  return <form onSubmit={guardar}><h3>Datos del cliente</h3><div className="pago-fields">{Object.entries({ nombre: 'Nombre', apellido: 'Apellido', dni: 'DNI', domicilio: 'Domicilio', ciudad: 'Localidad' }).map(([k, label]) => <label key={k}>{label}<input required={k !== 'apellido'} value={campos[k]} disabled={guardando} onChange={e => setCampos({ ...campos, [k]: e.target.value })} /></label>)}</div>
    {error && <p role="alert">{error}</p>}<button disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar datos del cliente'}</button></form>
}

function CompletarPago({ pago, onSaved }) {
  const [campos, setCampos] = useState({ fecha_recibido: pago.fecha_recibido?.slice(0, 10) || '', metodo: pago.metodo || '', tipo: pago.tipo || '', periodo_mes: pago.periodo_mes?.slice(0, 7) || '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  async function guardar(e) {
    e.preventDefault(); if (guardando) return
    setGuardando(true); setError('')
    try {
      const { data, error: err } = await supabase.from('pagos').update({ ...campos, periodo_mes: campos.tipo === 'mensualidad' ? `${campos.periodo_mes}-01` : null })
        .eq('id', pago.id).eq('reserva_id', pago.reserva_id).eq('confirmado', true).select('id').single()
      if (err || !data) throw err || new Error('El pago cambió')
      onSaved()
    } catch { setError('No se pudieron completar los datos del pago.') }
    finally { setGuardando(false) }
  }
  return <form onSubmit={guardar}><h3>Datos del pago recibido</h3><div className="pago-fields">
    <label>Fecha del cobro<input required type="date" value={campos.fecha_recibido} disabled={guardando} onChange={e => setCampos({ ...campos, fecha_recibido: e.target.value })} /></label>
    <label>Medio de pago<select required value={campos.metodo} disabled={guardando} onChange={e => setCampos({ ...campos, metodo: e.target.value })}><option value="">Elegí el medio</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="mercadopago">Mercado Pago</option><option value="otro">Otro</option></select></label>
    <label>Concepto<select required value={campos.tipo} disabled={guardando} onChange={e => setCampos({ ...campos, tipo: e.target.value })}><option value="">Elegí el concepto</option><option value="seña">Seña</option><option value="saldo">Saldo</option><option value="total">Total</option><option value="mensualidad">Mensualidad</option></select></label>
    {campos.tipo === 'mensualidad' && <label>Mes abonado<input required type="month" value={campos.periodo_mes} disabled={guardando} onChange={e => setCampos({ ...campos, periodo_mes: e.target.value })} /></label>}
    </div>{error && <p role="alert">{error}</p>}<button disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar datos del pago'}</button></form>
}
