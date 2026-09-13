import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, parseImporte, resumenCobros } from '../lib/cobros'
import './cobros.css'

export default function CobrosReserva({ reserva, onChange }) {
  const [pagos, setPagos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [cargaFallida, setCargaFallida] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [monto, setMonto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [anular, setAnular] = useState(null)
  const [estado, setEstado] = useState(reserva.estado)
  const [condiciones, setCondiciones] = useState(null)
  const [precio, setPrecio] = useState(String(reserva.precio_total ?? ''))
  const [sinSena, setSinSena] = useState(reserva.requiere_sena === false)
  const [editandoCondiciones, setEditandoCondiciones] = useState(false)
  const ocupado = useRef(false)

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
      const campos = { precio_total: total }
      if (Object.hasOwn(reserva, 'requiere_sena') || sinSena !== !resumen.requiereSena) campos.requiere_sena = !sinSena
      const { data, error: err } = await supabase.from('reservas')
        .update(campos).eq('id', reserva.id).select('*').single()
      if (err) throw err
      setCondiciones({ precio_total: data.precio_total, requiere_sena: data.requiere_sena })
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
    const importe = parseImporte(monto)
    if (ocupado.current || cargando) return
    if (!Number.isFinite(importe) || importe <= 0 || Math.abs(importe * 100 - Math.round(importe * 100)) > 0.00001) {
      setError('Ingresá un importe mayor a cero, con hasta dos decimales.')
      return
    }
    ocupado.current = true
    setGuardando(true)
    setError('')
    setMensaje('')
    try {
      const { data, error: err } = await supabase.from('pagos').insert({
        reserva_id: reserva.id, tipo: 'seña', monto: importe, confirmado: true,
      }).select('*').single()
      if (err) throw err
      setPagos(prev => [...prev, data])
      setMonto('')
      setMensaje('Seña registrada.')
      let nuevoEstado
      if (confirmar && estado === 'pendiente') {
        const { data: actualizada, error: estadoError } = await supabase.from('reservas').update({ estado: 'confirmada' })
          .eq('id', reserva.id).eq('estado', 'pendiente').select('id').maybeSingle()
        if (estadoError || !actualizada) setError('La seña se guardó, pero no se pudo confirmar la reserva. No vuelvas a cargar el pago.')
        else { setEstado('confirmada'); nuevoEstado = 'confirmada' }
      }
      setConfirmar(false)
      onChange?.(nuevoEstado)
    } catch (err) {
      setError('No se pudo registrar la seña. ' + err.message)
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
        setEditandoCondiciones(v => !v)
      }}>Condiciones de cobro</button>
    </div>
    {error && <p className="cobros-error" role="alert">{error}</p>}
    {mensaje && <p role="status">{mensaje}</p>}
    {editandoCondiciones && <form className="cobros-condiciones" onSubmit={guardarCondiciones}>
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
      <ul className="cobros-historial">
        {pagos.filter(p => Number(p.monto) > 0).map(p => <li key={p.id}>
          <span>{p.tipo || 'Pago'} · <strong>{dinero(p.monto)}</strong><small>{p.confirmado ? 'Registrado' : 'No contabilizado'}</small></span>
          {p.confirmado && <button type="button" disabled={guardando} onClick={() => setAnular(p.id)}>Anular registro</button>}
        </li>)}
      </ul>
      {anular && <div className="cobros-aviso" role="group" aria-label="Confirmar anulación">
        <p>¿Anular este registro? Se descontará del recibido. Esto no devuelve dinero al cliente.</p>
        <div className="cobros-acciones"><button disabled={guardando} onClick={anularPago}>Anular registro</button><button disabled={guardando} onClick={() => setAnular(null)}>Cancelar</button></div>
      </div>}
      {!['cerrada', 'cancelada'].includes(estado) && resumen.requiereSena && <form className="cobros-registro" onSubmit={guardar}>
        <label>Importe de la seña<input required inputMode="decimal" placeholder="0,00" value={monto} onChange={e => setMonto(e.target.value)} disabled={guardando} /></label>
        {estado === 'pendiente' && <label className="cobros-check"><input type="checkbox" checked={confirmar} onChange={e => setConfirmar(e.target.checked)} disabled={guardando} />Confirmar también la reserva</label>}
        <button className="cobros-primary" disabled={guardando || !monto}>{guardando ? 'Guardando…' : 'Registrar seña recibida'}</button>
      </form>}
    </>}
  </section>
}
