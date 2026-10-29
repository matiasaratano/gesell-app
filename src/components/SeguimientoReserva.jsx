import { seguimientoReserva } from '../lib/seguimiento-reserva.js'

export default function SeguimientoReserva({ reserva, pagos, mensajes, onAccion, onMarcar, disabled }) {
  const pasos = seguimientoReserva(reserva, pagos, mensajes)
  if (!pasos.length) return null
  return <section className="seguimiento-reserva" aria-label="Seguimiento de la reserva"><ol>{pasos.map((p, i) => <li key={p.id} className={p.completo ? 'paso-completo' : p.opcional ? 'paso-opcional' : ''}><div className="seguimiento-etiqueta"><span aria-hidden="true">{p.completo ? '✓' : i + 1}</span><strong>{p.titulo}</strong></div><p>{p.estado}</p><div className="seguimiento-acciones"><button type="button" disabled={disabled || p.habilitado === false} onClick={() => onAccion(p)}>{p.boton}</button>{p.campo && !p.registrado && <button type="button" disabled={disabled || p.habilitado === false} onClick={() => onMarcar(p.campo, p.manual ? null : new Date().toISOString())}>{p.manual ? 'Marcar pendiente' : 'Ya lo envié'}</button>}{p.registrado && <button type="button" disabled={disabled} onClick={() => onAccion(p)}>Ver envío</button>}</div></li>)}</ol></section>
}
