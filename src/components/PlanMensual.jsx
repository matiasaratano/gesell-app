import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, parseImporte } from '../lib/cobros.js'
import { hoyLocal, mensualidades } from '../lib/operacion-reserva.js'
import { cuotasMensuales, generarCuotas, limitesMeses } from '../lib/mensualidades.js'

const fecha = value => value.split('-').reverse().join('/')
const mesLabel = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export default function PlanMensual({ reserva, pagos, onCobrar, onChange, disabled }) {
  const [plan, setPlan] = useState(reserva.plan_mensual || [])
  const limites = limitesMeses(reserva)
  const mesActual = hoyLocal().slice(0, 7)
  const [form, setForm] = useState({ desde: mesActual < limites.min ? limites.min : mesActual > limites.max ? limites.max : mesActual, hasta: limites.max, importe: '', dia: '10' })
  const [agregando, setAgregando] = useState(false)
  const [edicion, setEdicion] = useState(null)
  const [eliminar, setEliminar] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const ocupado = useRef(false)
  const cuotas = cuotasMensuales({ ...reserva, plan_mensual: plan }, pagos)
  const sinAsignar = mensualidades(pagos).filter(([mes]) => !plan.some(c => c.mes.slice(0, 7) === mes))
  const sinMes = pagos.filter(p => p.confirmado && Number(p.monto) > 0 && (p.tipo !== 'mensualidad' || !p.periodo_mes))
    .reduce((sum, p) => sum + Math.round(Number(p.monto) * 100), 0) / 100
  const disponible = Object.hasOwn(reserva, 'plan_mensual')
  const bloqueado = disabled || guardando || !disponible || ['cancelada', 'cerrada'].includes(reserva.estado)

  async function guardar(nuevoPlan) {
    if (ocupado.current || bloqueado) return
    ocupado.current = true; setGuardando(true); setError(''); setMensaje('')
    try {
      // Compare the full previous plan so a second device cannot silently overwrite it.
      const { data, error: err } = await supabase.from('reservas').update({ plan_mensual: nuevoPlan })
        .eq('id', reserva.id).eq('plan_mensual', JSON.stringify(plan))
        .eq('checkin', reserva.checkin).eq('checkout', reserva.checkout).select('plan_mensual').maybeSingle()
      if (err) throw err
      if (!data) throw new Error('La reserva cambió en otra pantalla. Volvé a abrirla antes de guardar.')
      setPlan(data.plan_mensual); setAgregando(false); setEdicion(null); setEliminar(null)
      setMensaje('Mensualidades guardadas.'); onChange?.()
    } catch (err) { setError(err.message) }
    finally { ocupado.current = false; setGuardando(false) }
  }
  function agregar(e) {
    e.preventDefault()
    try { guardar(generarCuotas({ ...reserva, plan_mensual: plan }, form)) }
    catch (err) { setError(err.message) }
  }
  function editar(e) {
    e.preventDefault()
    const importe = parseImporte(edicion.importe)
    if (!Number.isFinite(importe) || importe <= 0 || !edicion.vencimiento) { setError('Revisá el importe y el vencimiento.'); return }
    guardar(plan.map(c => c.mes === edicion.mes ? { mes: c.mes, importe, vencimiento: edicion.vencimiento } : c))
  }
  const cambiar = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))
  return <section className="plan-mensual" aria-label="Mensualidades">
    <div className="cobros-section-heading"><h3>Mensualidades</h3><button type="button" disabled={bloqueado} onClick={() => { setAgregando(v => !v); setEdicion(null) }}>Agregar meses</button></div>
    {!disponible && <p role="alert" className="cobros-aviso">Falta activar la actualización de mensualidades en Supabase.</p>}
    {error && <p role="alert" className="cobros-error">{error}</p>}
    {mensaje && <p role="status">{mensaje}</p>}
    {agregando && <form className="plan-form" onSubmit={agregar}>
      <div className="pago-fields">
        <label>Desde el mes<input required type="month" min={limites.min} max={limites.max} value={form.desde} onChange={e => cambiar('desde', e.target.value)} disabled={bloqueado} /></label>
        <label>Hasta el mes<input required type="month" min={form.desde || limites.min} max={limites.max} value={form.hasta} onChange={e => cambiar('hasta', e.target.value)} disabled={bloqueado} /></label>
        <label>Importe por mes<input required inputMode="decimal" placeholder="0,00" value={form.importe} onChange={e => cambiar('importe', e.target.value)} disabled={bloqueado} /></label>
        <label>Día de vencimiento<input required type="number" min="1" max="31" value={form.dia} onChange={e => cambiar('dia', e.target.value)} disabled={bloqueado} /></label>
      </div>
      <div className="cobros-acciones"><button className="cobros-primary" disabled={bloqueado}>Guardar mensualidades</button><button type="button" disabled={guardando} onClick={() => setAgregando(false)}>Cancelar</button></div>
    </form>}
    {!cuotas.length && <p>Sin mensualidades programadas.</p>}
    <ul className="plan-lista">{cuotas.map(c => <li key={c.mes}>
      <div className="plan-cabecera"><strong>{mesLabel(c.mes)}</strong><span className={`cobros-badge ${c.vencida || c.estado === 'parcial' ? 'cobros-badge-sin-sena' : c.estado === 'pagado' ? 'cobros-badge-pagada' : 'cobros-badge-sin-requisito'}`}>{c.estado === 'pagado' ? 'Pagado' : c.estado === 'parcial' ? 'Parcial' : 'Pendiente'}{c.vencida ? ' · Vencida' : ''}</span></div>
      <small>Vence {fecha(c.vencimiento)}</small>
      {(c.mes.slice(0, 7) < limites.min || c.mes.slice(0, 7) > limites.max) && <p className="cobros-aviso">Mes fuera de las fechas actuales de la estadía.</p>}
      <div className="cobros-importes"><div><small>Acordado</small><strong>{dinero(c.importe)}</strong></div><div><small>Recibido</small><strong>{dinero(c.recibido)}</strong></div><div><small>Saldo del mes</small><strong>{dinero(c.saldo)}</strong></div></div>
      {c.recibido > c.importe && <small>A favor en este mes: {dinero(Math.round((c.recibido - c.importe) * 100) / 100)}</small>}
      {edicion?.mes === c.mes ? <form className="plan-form" onSubmit={editar}><div className="pago-fields">
        <label>Importe acordado<input required inputMode="decimal" value={edicion.importe} disabled={bloqueado} onChange={e => setEdicion({ ...edicion, importe: e.target.value })} /></label>
        <label>Vencimiento<input required type="date" value={edicion.vencimiento} disabled={bloqueado} onChange={e => setEdicion({ ...edicion, vencimiento: e.target.value })} /></label>
      </div><div className="cobros-acciones"><button className="cobros-primary" disabled={bloqueado}>Guardar mes</button><button type="button" onClick={() => { setEdicion(null); setEliminar(null) }} disabled={guardando}>Cancelar</button>{c.recibido === 0 && <button type="button" className="cobros-danger" disabled={bloqueado} onClick={() => setEliminar(c.mes)}>Quitar mes</button>}</div></form> : <div className="cobros-acciones">
        {c.saldo > 0 && <button type="button" className="cobros-primary" disabled={bloqueado} onClick={() => onCobrar(c)}>Registrar pago</button>}
        <button type="button" disabled={bloqueado} onClick={() => { setEdicion({ mes: c.mes, importe: String(c.importe), vencimiento: c.vencimiento }); setAgregando(false) }}>Ajustar mes</button>
      </div>}
      {eliminar === c.mes && <div className="cobros-aviso"><p>¿Quitar la mensualidad de {mesLabel(c.mes)}?</p><div className="cobros-acciones"><button type="button" className="cobros-danger" disabled={bloqueado} onClick={() => guardar(plan.filter(q => q.mes !== c.mes))}>Confirmar quitar mes</button><button type="button" disabled={guardando} onClick={() => setEliminar(null)}>Cancelar</button></div></div>}
    </li>)}</ul>
    {sinAsignar.length > 0 && <div className="cobros-aviso"><strong>Pagos en meses sin importe acordado</strong>{sinAsignar.map(([mes, monto]) => <p key={mes}>{mes.split('-').reverse().join('/')} · {dinero(monto)}</p>)}</div>}
    {sinMes > 0 && <p className="cobros-aviso">Pagos sin mes asignado: {dinero(sinMes)}</p>}
  </section>
}
