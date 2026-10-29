import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function CancelarReserva({ reserva, onClose, onSaved }) {
  const dialog = useRef(null), lock = useRef(false)
  const [motivo, setMotivo] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => { dialog.current.showModal() }, [])
  async function cancelar(e) {
    e.preventDefault()
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const { error } = await supabase.rpc('cancelar_reserva', { p_id: reserva.id, p_motivo: motivo.trim() })
      if (error) throw error
      onSaved()
    } catch (e) { setError(e.code === 'PGRST202' ? 'Falta activar la actualización de gestión en Supabase. No se canceló la reserva.' : e.message) }
    finally { lock.current = false; setBusy(false) }
  }
  return <dialog ref={dialog} className="cobros solicitudes-dialog" aria-label="Cancelar reserva" onCancel={e => { e.preventDefault(); if (!busy) onClose() }}><h2>Cancelar reserva</h2><p>Se liberarán las fechas en la app y se conservarán los pagos y el historial. Booking y Airbnb se gestionan por separado.</p><p>Esta acción no devuelve dinero al huésped.</p><form onSubmit={cancelar}><label>Motivo<textarea required maxLength={1000} value={motivo} onChange={e => setMotivo(e.target.value)} disabled={busy} /></label>{error && <p role="alert" className="cobros-error">{error}</p>}<div className="cobros-acciones"><button className="cobros-danger" disabled={busy || !motivo.trim()}>Confirmar cancelación</button><button type="button" disabled={busy} onClick={onClose}>Volver</button></div></form></dialog>
}
