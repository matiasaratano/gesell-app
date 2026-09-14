export default function PagoFields({ value, onChange, disabled = false, total, checkin, checkout }) {
  const cambiar = (campo, dato) => onChange({ ...value, [campo]: dato })
  return <div className="pago-fields">
    <label>Concepto<select aria-label="Concepto" value={value.tipo} disabled={disabled} onChange={e => onChange({ ...value, tipo: e.target.value, monto: e.target.value === 'total' && total != null ? String(total) : value.monto })}>
      <option value="seña">Seña</option><option value="saldo">Pago de saldo</option><option value="total">Pago total</option><option value="mensualidad">Mensualidad</option>
    </select></label>
    <label>Importe recibido<input required inputMode="decimal" value={value.monto} placeholder="0,00" disabled={disabled} onChange={e => cambiar('monto', e.target.value)} /></label>
    <label>Fecha del cobro<input required type="date" value={value.fecha_recibido} disabled={disabled} onChange={e => cambiar('fecha_recibido', e.target.value)} /></label>
    <label>Medio de pago<select aria-label="Medio de pago" value={value.metodo} disabled={disabled} onChange={e => cambiar('metodo', e.target.value)}><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="otro">Otro</option></select></label>
    {value.tipo === 'mensualidad' && <label>Mes abonado<input required type="month" min={checkin?.slice(0, 7)} max={checkout?.slice(0, 7)} value={value.periodo_mes} disabled={disabled} onChange={e => cambiar('periodo_mes', e.target.value)} /></label>}
  </div>
}
