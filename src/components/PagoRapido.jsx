import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, nombreCliente, resumenCobros } from '../lib/cobros.js'
import { datosPago, pagoVacio } from '../lib/operacion-reserva.js'
import { cuotasMensuales } from '../lib/mensualidades.js'
import PagoFields from './PagoFields'
import { Link } from 'react-router-dom'

export default function PagoRapido({ reservaId, onClose, onSaved }) {
  const dialogo = useRef(null)
  const ocupado = useRef(false)
  const idPago = useRef(crypto.randomUUID())
  const [reserva, setReserva] = useState(null)
  const [pago, setPago] = useState(pagoVacio)
  const [saldo, setSaldo] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [revision, setRevision] = useState(0)
  const [registrado, setRegistrado] = useState(null)
  useEffect(() => { dialogo.current.showModal() }, [])
  useEffect(() => {
    let activo = true
    setError('')
    supabase.from('reservas').select('*, clientes(*), propiedades(*), pagos(*)').eq('id', reservaId).single()
      .then(({ data, error: err }) => {
        if (!activo) return
        if (err || !data) { setError('No se pudo cargar la reserva.'); return }
        const resumen = resumenCobros(data, data.pagos || [])
        const cuota = cuotasMensuales(data, data.pagos || []).find(c => c.saldo > 0)
        const tipo = data.modalidad === 'mensual' ? 'mensualidad' : resumen.recibido > 0 || !resumen.requiereSena ? 'saldo' : 'seña'
        setReserva(data); setSaldo(resumen.saldo)
        setPago({ ...pagoVacio(tipo), monto: tipo === 'mensualidad' && cuota ? String(cuota.saldo) : '', periodo_mes: cuota?.mes.slice(0, 7) || '' })
      }).catch(() => { if (activo) setError('No se pudo cargar la reserva.') })
    return () => { activo = false }
  }, [reservaId, revision])
  function cerrar() { if (!ocupado.current) onClose() }
  async function guardar(e) {
    e.preventDefault()
    if (ocupado.current) return
    ocupado.current = true; setGuardando(true); setError('')
    try {
      const { data, error: err } = await supabase.rpc('registrar_cobro', {
        p_reserva: reservaId, p_pago: datosPago(pago, idPago.current), p_confirmar: confirmar,
      })
      if (err || !data?.id) throw err || new Error('No se recibió la confirmación del pago.')
      setRegistrado(data.id)
      onSaved()
    } catch (err) { setError(`No se pudo registrar el pago. ${err.message}`) }
    finally { ocupado.current = false; setGuardando(false) }
  }
  return <dialog ref={dialogo} className="cobros pago-rapido" aria-labelledby="pago-rapido-titulo" onCancel={e => { e.preventDefault(); cerrar() }}>
    <h2 id="pago-rapido-titulo">Registrar pago</h2>
    {error && <p role="alert" className="cobros-error">{error}</p>}
    {!reserva && !error && <p role="status">Cargando reserva…</p>}
    {!reserva && error && <button onClick={() => setRevision(r => r + 1)}>Reintentar</button>}
    {registrado ? <><p role="status">Pago registrado.</p><Link className="cobros-link" to={`/recibos?reserva_id=${reservaId}&pago_id=${registrado}`}>Generar recibo</Link></> : reserva && (['cerrada', 'cancelada'].includes(reserva.estado) ? <p role="alert">Esta reserva no admite pagos.</p> : <form onSubmit={guardar}>
      <p><strong>{nombreCliente(reserva)}</strong><br />{reserva.propiedades?.nombre}</p>
      <p>Saldo de la estadía: {saldo === null ? 'Sin precio definido' : dinero(saldo)}</p>
      <PagoFields value={pago} onChange={setPago} disabled={guardando} total={saldo} checkin={reserva.checkin} checkout={reserva.checkout} />
      {reserva.estado === 'pendiente' && <label className="cobros-check"><input type="checkbox" checked={confirmar} disabled={guardando} onChange={e => setConfirmar(e.target.checked)} />Confirmar también la reserva</label>}
      <button className="cobros-primary" disabled={guardando || !pago.monto}>{guardando ? 'Guardando…' : 'Registrar pago recibido'}</button>
    </form>)}
    <div className="cobros-acciones"><button type="button" disabled={guardando} onClick={cerrar}>{registrado ? 'Cerrar' : 'Cancelar'}</button></div>
  </dialog>
}
