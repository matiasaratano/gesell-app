import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, parseImporte, resumenCobros } from '../lib/cobros'
import './cobros.css'
import PagoFields from './PagoFields'
import { datosPago, pagoVacio, mensualidades } from '../lib/operacion-reserva.js'
import { cuotasMensuales } from '../lib/mensualidades.js'
import PlanMensual from './PlanMensual'
import { Link } from 'react-router-dom'

export default function CobrosReserva({ reserva, onChange, mesInicial = '' }) {
  const [pagos, setPagos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [cargaFallida, setCargaFallida] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [pago, setPago] = useState(() => pagoVacio(reserva.modalidad === 'mensual' ? 'mensualidad' : reserva.requiere_sena === false ? 'saldo' : 'seña'))
  const pagoIdRef = useRef(crypto.randomUUID())
  const [modalidad, setModalidad] = useState(reserva.modalidad || 'temporal')
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [anular, setAnular] = useState(null)
  const [estado, setEstado] = useState(reserva.estado)
  const [condiciones, setCondiciones] = useState(null)
  const [precio, setPrecio] = useState(String(reserva.precio_total ?? ''))
  const [sinSena, setSinSena] = useState(reserva.requiere_sena === false)
  const [editandoCondiciones, setEditandoCondiciones] = useState(false)
  const ocupado = useRef(false)
  const formularioRef = useRef(null)
  const precargado = useRef(false)
  const esMensual = (condiciones?.modalidad || reserva.modalidad) === 'mensual'

  useEffect(() => {
    if (precargado.current || cargando || cargaFallida || !mesInicial) return
    precargado.current = true
    const cuota = cuotasMensuales(reserva, pagos).find(c => c.mes.slice(0, 7) === mesInicial)
    if (cuota?.saldo > 0) {
      setPago({ ...pagoVacio('mensualidad'), periodo_mes: mesInicial, monto: String(cuota.saldo) })
      formularioRef.current?.scrollIntoView({ block: 'center' })
    }
  }, [cargando, cargaFallida, mesInicial, reserva, pagos])

  function cobrarMes(cuota) {
    setPago({ ...pagoVacio('mensualidad'), periodo_mes: cuota.mes.slice(0, 7), monto: String(cuota.saldo) })
    pagoIdRef.current = crypto.randomUUID()
    setError(''); setMensaje('')
    formularioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  useEffect(() => {
    let activo = true
    supabase.from('pagos').select('*').eq('reserva_id', reserva.id).then(({ data, error: err }) => {
      if (!activo) return
      if (err) { setError('No se pudieron cargar los pagos. ' + err.message); setCargaFallida(true) }
      else setPagos(data || [])
      setCargando(false)
    })
    return () => { activo = false }
  }, [reserva.id])

  const resumen = resumenCobros({ ...reserva, ...condiciones }, pagos)
  async function guardarCondiciones(e) {
    e.preventDefault()
    if (ocupado.current) return
    const total = parseImporte(precio)
    if (!Number.isFinite(total) || total <= 0) {
      setError('Ingresá el precio total de toda la estadía, mayor a cero.')
      return
    }
    ocupado.current = true
    setGuardando(true)
    setError('')
    setMensaje('')
    try {
      const campos = { precio_total: total, modalidad }
      if (Object.hasOwn(reserva, 'requiere_sena') || sinSena !== !resumen.requiereSena) campos.requiere_sena = !sinSena
      const { data, error: err } = await supabase.from('reservas')
        .update(campos).eq('id', reserva.id).select('*').single()
      if (err) throw err
      setCondiciones({ precio_total: data.precio_total, requiere_sena: data.requiere_sena, modalidad: data.modalidad })
      setPago(pagoVacio(data.modalidad === 'mensual' ? 'mensualidad' : data.requiere_sena === false ? 'saldo' : 'seña'))
      setEditandoCondiciones(false)
      setMensaje('Condiciones de cobro guardadas.')
      onChange?.()
    } catch (err) {
      setError('No se pudieron guardar las condiciones. ' + err.message)
    } finally {
      ocupado.current = false
      setGuardando(false)
    }
  }
  async function guardar(e) {
    e.preventDefault()
    if (ocupado.current || cargando) return
    ocupado.current = true
    setGuardando(true)
    setError('')
    setMensaje('')
    try {
      const payload = datosPago(pago, pagoIdRef.current)
      const { data, error: err } = await supabase.rpc('registrar_cobro', { p_reserva: reserva.id, p_pago: payload, p_confirmar: confirmar })
      if (err) throw err
      setPagos(prev => [...prev.filter(p => p.id !== data.id), data])
      pagoIdRef.current = crypto.randomUUID()
      setPago(prev => ({ ...prev, monto: '' }))
      setMensaje('Pago registrado.')
      let nuevoEstado
      if (confirmar && estado === 'pendiente') {
        setEstado('confirmada'); nuevoEstado = 'confirmada'
      }
      setConfirmar(false)
      onChange?.(nuevoEstado)
    } catch (err) {
      setError('No se pudo registrar el pago. ' + err.message)
    } finally {
      ocupado.current = false
      setGuardando(false)
    }
  }

  async function anularPago() {
    if (ocupado.current) return
    ocupado.current = true
    setGuardando(true)
    setError('')
    try {
      const { data, error: err } = await supabase.from('pagos').update({ confirmado: false })
        .eq('id', anular).eq('reserva_id', reserva.id).select('id').single()
      if (err || !data) throw err || new Error('No se actualizó el pago.')
      setPagos(prev => prev.map(p => p.id === anular ? { ...p, confirmado: false } : p))
      setAnular(null)
      setMensaje('Registro anulado. El estado de la reserva se mantiene.')
      onChange?.()
    } catch (err) {
      setError('No se pudo anular el registro. ' + err.message)
    } finally {
      ocupado.current = false
      setGuardando(false)
    }
  }

  return <section className="cobros cobros-detalle">
    <div className="cobros-section-heading"><h3>Cobros de la reserva</h3>
      <button type="button" disabled={guardando} onClick={() => {
        setPrecio(String(resumen.total ?? reserva.precio_total ?? ''))
        setSinSena(!resumen.requiereSena)
        setModalidad(condiciones?.modalidad || reserva.modalidad || 'temporal')
        setEditandoCondiciones(v => !v)
      }}>Condiciones de cobro</button>
    </div>
    {error && <p className="cobros-error" role="alert">{error}</p>}
    {mensaje && <p role="status">{mensaje}</p>}
    {editandoCondiciones && <form className="cobros-condiciones" onSubmit={guardarCondiciones}>
      <label>Tipo de alquiler<select value={modalidad} disabled={guardando} onChange={e => { setModalidad(e.target.value); if (e.target.value === 'mensual') setSinSena(true) }}><option value="temporal">Temporal</option><option value="mensual">Alquiler largo / mensual</option></select></label>
      <label>Precio total de toda la estadía<input required inputMode="decimal" value={precio} onChange={e => setPrecio(e.target.value)} disabled={guardando} /></label>
      <label className="cobros-check"><input type="checkbox" checked={sinSena} onChange={e => setSinSena(e.target.checked)} disabled={guardando} />No requiere seña</label>
      <div className="cobros-acciones"><button className="cobros-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar condiciones'}</button><button type="button" disabled={guardando} onClick={() => setEditandoCondiciones(false)}>Cancelar</button></div>
    </form>}
    {cargando ? <p role="status">Cargando pagos…</p> : cargaFallida ? <p>Volvé a abrir la reserva para reintentar.</p> : <>
      <div className="cobros-totales">
        <div><small>Total estadía</small><strong>{resumen.total === null ? 'A revisar' : dinero(resumen.total)}</strong></div>
        <div><small>Recibido</small><strong>{dinero(resumen.recibido)}</strong></div>
        <div><small>Saldo</small><strong>{resumen.saldo === null ? 'Sin calcular' : dinero(resumen.saldo)}</strong></div>
      </div>
      {!resumen.requiereSena && <p className="cobros-sin-sena">No requiere seña</p>}
      {resumen.total === null && <p className="cobros-aviso">Falta el precio total de la reserva.</p>}
      {resumen.excedente > 0 && <p className="cobros-aviso">Cobrado de más: {dinero(resumen.excedente)}</p>}
      {esMensual && <PlanMensual reserva={reserva} pagos={pagos} onCobrar={cobrarMes} onChange={onChange} disabled={guardando} />}
      <ul className="cobros-historial">
        {pagos.filter(p => Number(p.monto) > 0).map(p => <li key={p.id}>
          <span>{p.tipo || 'Pago'} · <strong>{dinero(p.monto)}</strong><small>{p.fecha_recibido?.slice(0, 10).split('-').reverse().join('/') || 'Sin fecha registrada'} · {p.metodo || 'Sin medio'}{p.periodo_mes ? ` · Mes ${p.periodo_mes.slice(0, 7)}` : ''} · {p.confirmado ? 'Registrado' : 'No contabilizado'}</small></span>
          {p.confirmado && <div className="cobros-acciones"><Link className="cobros-link" to={`/recibos?reserva_id=${reserva.id}&pago_id=${p.id}`}>Generar recibo</Link><button className="cobros-danger" type="button" disabled={guardando} onClick={() => setAnular(p.id)}>Anular registro</button></div>}
        </li>)}
      </ul>
      {!esMensual && mensualidades(pagos).length > 0 && <div className="cobros-meses"><h3>Mensualidades recibidas</h3>{mensualidades(pagos).map(([mes, monto]) => <p key={mes}>{mes.split('-').reverse().join('/')} <strong>{dinero(monto)}</strong></p>)}</div>}
      {anular && <div className="cobros-aviso" role="group" aria-label="Confirmar anulación">
        <p>¿Anular este registro? Se descontará del recibido. Esto no devuelve dinero al cliente.</p>
        <div className="cobros-acciones"><button className="cobros-danger" disabled={guardando} onClick={anularPago}>Anular registro</button><button disabled={guardando} onClick={() => setAnular(null)}>Cancelar</button></div>
      </div>}
      {!['cerrada', 'cancelada'].includes(estado) && <form ref={formularioRef} className="cobros-registro" onSubmit={guardar}>
        <h3>Registrar cobro</h3>
        <PagoFields value={pago} onChange={setPago} disabled={guardando} total={resumen.saldo} checkin={reserva.checkin} checkout={reserva.checkout} />
        {estado === 'pendiente' && <label className="cobros-check"><input type="checkbox" checked={confirmar} onChange={e => setConfirmar(e.target.checked)} disabled={guardando} />Confirmar también la reserva</label>}
        <button className="cobros-primary" disabled={guardando || !pago.monto}>{guardando ? 'Guardando…' : 'Registrar pago recibido'}</button>
      </form>}
    </>}
  </section>
}
