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
  const [registrando, setRegistrando] = useState(false)
  const [vista, setVista] = useState(reserva.modalidad === 'mensual' ? 'meses' : 'historial')
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
      setRegistrando(true)
    }
  }, [cargando, cargaFallida, mesInicial, reserva, pagos])

  useEffect(() => {
    if (registrando) formularioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [registrando])

  function cobrarMes(cuota) {
    setPago({ ...pagoVacio('mensualidad'), periodo_mes: cuota.mes.slice(0, 7), monto: String(cuota.saldo) })
    pagoIdRef.current = crypto.randomUUID()
    setError(''); setMensaje('')
    setRegistrando(true)
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
  const pagosVigentes = pagos.filter(p => Number(p.monto) > 0 && p.confirmado)
  const pagosExcluidos = pagos.filter(p => Number(p.monto) > 0 && !p.confirmado)
  const detallePago = p => <div className="pago-descripcion"><span className="pago-concepto">{p.tipo || 'Pago'}</span> · <strong>{dinero(p.monto)}</strong><small>{p.fecha_recibido?.slice(0, 10).split('-').reverse().join('/') || 'Sin fecha registrada'} · {p.metodo || 'Sin medio'}{p.periodo_mes ? ` · Mes ${p.periodo_mes.slice(0, 7).split('-').reverse().join('/')}` : ''}</small></div>
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
      setVista(data.modalidad === 'mensual' ? 'meses' : 'historial')
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
      setRegistrando(false)
      setVista('historial')
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
    <div className="cobros-section-heading"><div><h3>Resumen de cobros</h3><small>{esMensual ? 'Alquiler mensual' : 'Alquiler temporal'}{!resumen.requiereSena ? ' · Sin seña requerida' : ''}</small></div>
      <div className="cobros-acciones">
      {!['cerrada', 'cancelada'].includes(estado) && <button className="cobros-primary" disabled={guardando || cargando || cargaFallida} onClick={() => { setRegistrando(true); setEditandoCondiciones(false) }}>Registrar pago</button>}
      <button type="button" disabled={guardando} onClick={() => {
        setPrecio(String(resumen.total ?? reserva.precio_total ?? ''))
        setSinSena(!resumen.requiereSena)
        setModalidad(condiciones?.modalidad || reserva.modalidad || 'temporal')
        setEditandoCondiciones(v => !v); setRegistrando(false)
      }}>Condiciones de cobro</button>
      </div>
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
        <div><small>Saldo de la estadía</small><strong>{resumen.saldo === null ? 'Sin calcular' : dinero(resumen.saldo)}</strong></div>
      </div>
      {resumen.total === null && <p className="cobros-aviso">Falta el precio total de la reserva.</p>}
      {resumen.excedente > 0 && <p className="cobros-aviso">Cobrado de más: {dinero(resumen.excedente)}</p>}
      {registrando && !['cerrada', 'cancelada'].includes(estado) && <form ref={formularioRef} className="cobros-registro" onSubmit={guardar}>
        <h3>Registrar cobro</h3>
        <PagoFields value={pago} onChange={setPago} disabled={guardando} total={resumen.saldo} checkin={reserva.checkin} checkout={reserva.checkout} />
        {estado === 'pendiente' && <label className="cobros-check"><input type="checkbox" checked={confirmar} onChange={e => setConfirmar(e.target.checked)} disabled={guardando} />Confirmar también la reserva</label>}
        <div className="cobros-acciones"><button className="cobros-primary" disabled={guardando || !pago.monto}>{guardando ? 'Guardando…' : 'Registrar pago recibido'}</button><button type="button" disabled={guardando} onClick={() => setRegistrando(false)}>Cancelar</button></div>
      </form>}
      {esMensual && <div className="cobros-tabs" aria-label="Detalle de cobros"><button aria-pressed={vista === 'meses'} onClick={() => setVista('meses')}>Mensualidades</button><button aria-pressed={vista === 'historial'} onClick={() => setVista('historial')}>Pagos registrados ({pagosVigentes.length})</button></div>}
      {esMensual && vista === 'meses' && <PlanMensual reserva={reserva} pagos={pagos} onCobrar={cobrarMes} onChange={onChange} disabled={guardando} />}
      {(!esMensual || vista === 'historial') && <>
      <h3>Pagos registrados</h3>
      {!pagosVigentes.length && <p>No hay pagos registrados.</p>}
      <ul className="cobros-historial" aria-label="Pagos registrados">
        {pagosVigentes.map(p => <li key={p.id}>
          {detallePago(p)}
          <div className="cobros-acciones"><Link className="cobros-link" to={`/recibos?reserva_id=${reserva.id}&pago_id=${p.id}`}>Generar recibo</Link><button className="cobros-danger" type="button" disabled={guardando} onClick={() => setAnular(p.id)}>Anular registro</button></div>
        </li>)}
      </ul>
      {pagosExcluidos.length > 0 && <details className="cobros-excluidos"><summary>Registros no contabilizados ({pagosExcluidos.length})</summary><p>Incluye registros anulados. No suman al recibido ni reducen el saldo.</p><ul className="cobros-historial">{pagosExcluidos.map(p => <li key={p.id}>{detallePago(p)}</li>)}</ul></details>}
      {!esMensual && mensualidades(pagos).length > 0 && <div className="cobros-meses"><h3>Mensualidades recibidas</h3>{mensualidades(pagos).map(([mes, monto]) => <p key={mes}>{mes.split('-').reverse().join('/')} <strong>{dinero(monto)}</strong></p>)}</div>}
      {anular && <div className="cobros-aviso" role="group" aria-label="Confirmar anulación">
        <p>¿Anular este registro? Se descontará del recibido. Esto no devuelve dinero al cliente.</p>
        <div className="cobros-acciones"><button className="cobros-danger" disabled={guardando} onClick={anularPago}>Anular registro</button><button disabled={guardando} onClick={() => setAnular(null)}>Cancelar</button></div>
      </div>}
      </>}
    </>}
  </section>
}
