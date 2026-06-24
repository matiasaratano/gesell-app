import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useSearchParams } from 'react-router-dom'

// ─── Constantes ────────────────────────────────────────────────────────────────
const CANALES = ['whatsapp','mail','telefono','booking','airbnb','directo']

const ESTADOS = [
  { value: 'pendiente',  label: 'Pendiente',  bg: '#F3E8FF', color: '#6B21A8' },
  { value: 'confirmada', label: 'Confirmada', bg: '#D1FAE5', color: '#065F46' },
  { value: 'finalizada', label: 'Finalizada', bg: '#F3F4F6', color: '#374151' },
]

const PASOS = ['Propiedad y fechas', 'Cliente', 'Confirmar reserva']

// ─── Utilidades ───────────────────────────────────────────────────────────────
function padZ(n) { return String(n).padStart(2, '0') }

function toStr(year, month1, day) {
  return `${year}-${padZ(month1)}-${padZ(day)}`
}

function formatFecha(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

function diffNoches(desde, hasta) {
  // Comparar fechas sin timezone: construir manualmente
  if (!desde || !hasta) return 0
  const [y1, m1, d1] = desde.split('-').map(Number)
  const [y2, m2, d2] = hasta.split('-').map(Number)
  const a = new Date(y1, m1 - 1, d1)
  const b = new Date(y2, m2 - 1, d2)
  return Math.max(0, Math.round((b - a) / 86400000))
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function NuevaReserva({ onExito }) {
  const [searchParams] = useSearchParams()
  const initialPropId = searchParams.get('propiedad_id') || ''
  const initialCheckin = searchParams.get('checkin') || ''
  const initialCheckout = searchParams.get('checkout') || ''
  const initialEstado = searchParams.get('estado') || 'pendiente'

  const [paso, setPaso] = useState(0)

  // Paso 1
  const [propiedades, setPropiedades]   = useState([])
  const [propId,      setPropId]        = useState(initialPropId)
  const [checkin,     setCheckin]       = useState(initialCheckin)
  const [checkout,    setCheckout]      = useState(initialCheckout)
  const [adultos,     setAdultos]       = useState(2)
  const [menores,     setMenores]       = useState(0)
  const [mascotas,    setMascotas]      = useState(false)
  const [canal,       setCanal]         = useState('whatsapp')
  const [dispError,   setDispError]     = useState('')
  const [checkingDisp, setCheckingDisp] = useState(false)

  // Paso 2
  const [busqueda,    setBusqueda]      = useState('')
  const [clientesRes, setClientesRes]   = useState([])
  const [clienteId,   setClienteId]     = useState(null)
  const [clienteForm, setClienteForm]   = useState({
    nombre: '', apellido: '', dni: '', email: '',
    whatsapp: '', domicilio: '', ciudad: '',
  })
  const [modoCliente, setModoCliente]   = useState('buscar') // 'buscar' | 'nuevo' | 'seleccionado'

  // IA Parser
  const [fichaTexto, setFichaTexto] = useState('')
  const [parseando, setParseando] = useState(false)
  const [parseStatus, setParseStatus] = useState(null)

  // Paso 3
  const [precioTotal, setPrecioTotal]   = useState('')
  const [estado,      setEstado]        = useState(initialEstado)
  const [notasInt,    setNotasInt]      = useState('')
  const [guardando,   setGuardando]     = useState(false)
  const [guardError,  setGuardError]    = useState('')
  const [exitoMsg,    setExitoMsg]      = useState('')

  // ── Cargar propiedades ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('propiedades')
      .select('id, nombre, capacidad_max, acepta_mascotas, alias_cbu')
      .eq('activa', true)
      .order('nombre')
      .then(({ data }) => setPropiedades(data ?? []))
  }, [])

  const propiedad    = propiedades.find(p => p.id === propId) ?? null
  const noches       = diffNoches(checkin, checkout)
  const clienteLabel = modoCliente === 'seleccionado'
    ? `${clienteForm.nombre} ${clienteForm.apellido}`
    : modoCliente === 'nuevo'
    ? 'Cliente nuevo'
    : ''

  // ── PASO 1: verificar disponibilidad ────────────────────────────────────────
  async function verificarYAvanzar() {
    setDispError('')
    if (!propId)   return setDispError('Seleccioná una propiedad.')
    if (!checkin)  return setDispError('Ingresá la fecha de check-in.')
    if (!checkout) return setDispError('Ingresá la fecha de check-out.')
    if (checkout <= checkin) return setDispError('El check-out debe ser posterior al check-in.')

    setCheckingDisp(true)
    const { data: conflictos, error } = await supabase
      .from('reservas')
      .select('id, checkin, checkout, clientes(nombre, apellido)')
      .eq('propiedad_id', propId)
      .neq('estado', 'cancelada')
      .lt('checkin', checkout)  // comienza antes de que termine la nueva
      .gt('checkout', checkin)  // termina después de que empiece la nueva

    setCheckingDisp(false)

    if (error) return setDispError('Error verificando disponibilidad.')

    if (conflictos && conflictos.length > 0) {
      const c = conflictos[0]
      return setDispError(
        `Sin disponibilidad: existe una reserva de ${c.clientes?.nombre} ${c.clientes?.apellido} del ${formatFecha(c.checkin)} al ${formatFecha(c.checkout)}.`
      )
    }

    setPaso(1)
  }

  // ── PASO 2: buscar clientes ─────────────────────────────────────────────────
  useEffect(() => {
    if (busqueda.length < 2) { setClientesRes([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, apellido, dni, whatsapp, email, ciudad')
        .or(`nombre.ilike.%${busqueda}%,apellido.ilike.%${busqueda}%,dni.ilike.%${busqueda}%`)
        .limit(6)
      setClientesRes(data ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda])

  function seleccionarCliente(c) {
    setClienteId(c.id)
    setClienteForm({
      nombre:   c.nombre   ?? '',
      apellido: c.apellido ?? '',
      dni:      c.dni      ?? '',
      email:    c.email    ?? '',
      whatsapp: c.whatsapp ?? '',
      domicilio:'',
      ciudad:   c.ciudad   ?? '',
    })
    setModoCliente('seleccionado')
    setClientesRes([])
    setBusqueda('')
  }

  function nuevoCliente() {
    setClienteId(null)
    setClienteForm({ nombre:'', apellido:'', dni:'', email:'', whatsapp:'', domicilio:'', ciudad:'' })
    setModoCliente('nuevo')
    setFichaTexto('')
    setParseStatus(null)
  }

  async function parsearFicha() {
    if (!fichaTexto.trim()) return
    setParseando(true)
    setParseStatus(null)
    try {
      const res = await fetch('https://deptos-proxy.vercel.app/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: fichaTexto }),
      })
      if (!res.ok) throw new Error()
      const parsed = await res.json()
      if (parsed.nombre) setClienteForm(f => ({ ...f, nombre: parsed.nombre }))
      if (parsed.dni) setClienteForm(f => ({ ...f, dni: parsed.dni }))
      if (parsed.direccion) setClienteForm(f => ({ ...f, domicilio: parsed.direccion }))
      if (parsed.localidad) setClienteForm(f => ({ ...f, ciudad: parsed.localidad }))
      if (parsed.tel) setClienteForm(f => ({ ...f, whatsapp: parsed.tel }))
      if (parsed.email) setClienteForm(f => ({ ...f, email: parsed.email }))
      setParseStatus('ok')
    } catch (e) {
      setParseStatus('error')
    } finally {
      setParseando(false)
    }
  }

  function validarPaso2() {
    if (modoCliente === 'buscar') return 'Buscá o creá un cliente.'
    if (!clienteForm.nombre.trim()) return 'El nombre es obligatorio.'
    return ''
  }

  // ── PASO 3: guardar reserva ─────────────────────────────────────────────────
  async function guardarReserva() {
    setGuardError('')
    if (!precioTotal || isNaN(Number(precioTotal))) {
      return setGuardError('Ingresá un precio total válido.')
    }
    setGuardando(true)

    try {
      let cId = clienteId

      // Crear cliente si es nuevo
      if (modoCliente === 'nuevo' || !cId) {
        const { data: nuevoCli, error: errCli } = await supabase
          .from('clientes')
          .insert({
            nombre:   clienteForm.nombre.trim(),
            apellido: clienteForm.apellido.trim() || null,
            dni:      clienteForm.dni.trim()      || null,
            email:    clienteForm.email.trim()    || null,
            whatsapp: clienteForm.whatsapp.trim() || null,
            ciudad:   clienteForm.ciudad.trim()   || null,
          })
          .select('id')
          .single()

        if (errCli) throw new Error('Error creando cliente: ' + errCli.message)
        cId = nuevoCli.id
      }

      // Crear reserva
      const { data: nuevaRes, error: errRes } = await supabase
        .from('reservas')
        .insert({
          propiedad_id:    propId,
          cliente_id:      cId,
          canal_origen:    canal,
          checkin:         checkin,
          checkout:        checkout,
          adultos:         adultos,
          menores:         menores,
          mascotas:        mascotas,
          precio_total:    Number(precioTotal),
          estado:          estado,
          notas_internas:  notasInt.trim() || null,
        })
        .select('id')
        .single()

      if (errRes) throw new Error('Error creando reserva: ' + errRes.message)

      // Crear pago de seña (sin monto definido aún, queda pendiente)
      await supabase.from('pagos').insert({
        reserva_id:     nuevaRes.id,
        tipo:           'seña',
        monto:          0,
        confirmado:     false,
      })

      onExito?.(nuevaRes.id)
      setExitoMsg('✓ Reserva creada exitosamente')
      setTimeout(() => setExitoMsg(''), 3000)
      resetForm()
    } catch (e) {
      setGuardError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  function resetForm() {
    setPaso(0)
    setPropId('')
    setCheckin('')
    setCheckout('')
    setAdultos(2)
    setMenores(0)
    setMascotas(false)
    setCanal('whatsapp')
    setClienteId(null)
    setClienteForm({ nombre:'', apellido:'', dni:'', email:'', whatsapp:'', domicilio:'', ciudad:'' })
    setModoCliente('buscar')
    setPrecioTotal('')
    setEstado('pendiente')
    setNotasInt('')
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <h2 style={s.titulo}>Nueva reserva</h2>

      {/* Indicador de pasos */}
      <div style={s.stepper}>
        {PASOS.map((label, i) => (
          <div key={i} style={s.stepperItem}>
            <div style={{
              ...s.stepCircle,
              background: i < paso ? '#2E9E6B' : i === paso ? '#2d5a3d' : '#e0e0e0',
              color: i <= paso ? '#fff' : '#999',
            }}>
              {i < paso ? '✓' : i + 1}
            </div>
            <span style={{ ...s.stepLabel, color: i === paso ? '#1a1a1a' : '#999' }}>
              {label}
            </span>
            {i < PASOS.length - 1 && <div style={s.stepLine} />}
          </div>
        ))}
      </div>

      {/* Mensaje de éxito */}
      {exitoMsg && <div style={s.exitoBox}>{exitoMsg}</div>}

      {/* ── PASO 0: Propiedad y fechas ─────────────────────────────────────── */}
      {paso === 0 && (
        <Seccion titulo="Propiedad y fechas">
          <Campo label="Propiedad *">
            <select
              style={s.input}
              value={propId}
              onChange={e => { setPropId(e.target.value); setDispError('') }}
            >
              <option value="">— Seleccioná una propiedad —</option>
              {propiedades.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nombre} {p.capacidad_max ? `(hasta ${p.capacidad_max} pers.)` : ''}
                </option>
              ))}
            </select>
          </Campo>

          <div style={s.row2}>
            <Campo label="Check-in *">
              <input
                type="date"
                style={s.input}
                value={checkin}
                min={toStr(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate())}
                onChange={e => { setCheckin(e.target.value); setDispError('') }}
              />
            </Campo>
            <Campo label="Check-out *">
              <input
                type="date"
                style={s.input}
                value={checkout}
                min={checkin || undefined}
                onChange={e => { setCheckout(e.target.value); setDispError('') }}
              />
            </Campo>
          </div>

          {checkin && checkout && checkout > checkin && (
            <div style={s.nochesBadge}>{noches} {noches === 1 ? 'noche' : 'noches'}</div>
          )}

          <div style={s.row2}>
            <Campo label="Adultos">
              <input
                type="number" min={1} max={20} style={s.input}
                value={adultos} onChange={e => setAdultos(Number(e.target.value))}
              />
            </Campo>
            <Campo label="Menores">
              <input
                type="number" min={0} max={20} style={s.input}
                value={menores} onChange={e => setMenores(Number(e.target.value))}
              />
            </Campo>
          </div>

          <div style={s.row2}>
            <Campo label="Mascotas">
              <label style={s.checkLabel}>
                <input
                  type="checkbox" checked={mascotas}
                  onChange={e => setMascotas(e.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Viaja con mascota
                {propiedad && !propiedad.acepta_mascotas && mascotas && (
                  <span style={s.warnText}> ⚠ Esta propiedad no acepta mascotas</span>
                )}
              </label>
            </Campo>
            <Campo label="Canal de origen">
              <select
                style={s.input} value={canal}
                onChange={e => setCanal(e.target.value)}
              >
                {CANALES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </Campo>
          </div>

          {dispError && <MensajeError texto={dispError} />}

          <div style={s.footerBtns}>
            <button
              style={{...s.btnPrimario, opacity: checkingDisp ? 0.7 : 1}}
              onClick={verificarYAvanzar}
              disabled={checkingDisp}
            >
              {checkingDisp ? 'Verificando…' : 'Verificar disponibilidad →'}
            </button>
          </div>
        </Seccion>
      )}

      {/* ── PASO 1: Cliente ────────────────────────────────────────────────── */}
      {paso === 1 && (
        <Seccion titulo="Datos del cliente">

          {modoCliente !== 'seleccionado' && modoCliente !== 'nuevo' && (
            <>
              <Campo label="Buscar cliente existente">
                <input
                  type="text"
                  style={s.input}
                  placeholder="Nombre, apellido o DNI…"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  autoFocus
                />
              </Campo>

              {clientesRes.length > 0 && (
                <div style={s.dropdown}>
                  {clientesRes.map(c => (
                    <div
                      key={c.id}
                      style={s.dropdownItem}
                      onClick={() => seleccionarCliente(c)}
                    >
                      <span style={s.dropdownNombre}>{c.nombre} {c.apellido}</span>
                      <span style={s.dropdownSub}>DNI {c.dni ?? '—'}  ·  {c.ciudad ?? ''}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <button style={s.btnOutline} onClick={nuevoCliente}>
                  + Crear cliente nuevo
                </button>
              </div>
            </>
          )}

          {/* Cliente seleccionado (existente) */}
          {modoCliente === 'seleccionado' && (
            <div style={s.clienteCard}>
              <div style={s.clienteCardHeader}>
                <span style={s.clienteCardNombre}>{clienteForm.nombre} {clienteForm.apellido}</span>
                <button style={s.linkBtn} onClick={() => setModoCliente('buscar')}>Cambiar</button>
              </div>
              <span style={s.clienteCardSub}>DNI {clienteForm.dni || '—'}  ·  {clienteForm.whatsapp || 'sin WhatsApp'}</span>
            </div>
          )}

          {/* Formulario cliente nuevo */}
          {modoCliente === 'nuevo' && (
            <>
              {/* IA Parser */}
              <div style={{ marginBottom: 16, padding: 14, background: '#fafafa', borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: '#666', textTransform: 'uppercase' }}>✦ Extraer desde ficha</div>
                <textarea
                  style={{ ...s.input, minHeight: 60, resize: 'vertical', marginBottom: 8 }}
                  placeholder="Pegá el texto de la ficha del cliente…"
                  value={fichaTexto}
                  onChange={e => setFichaTexto(e.target.value)}
                />
                <button style={{ ...s.btnOutline, width: '100%', background: '#2d5a3d', color: '#fff', border: 'none' }} onClick={parsearFicha} disabled={parseando}>
                  {parseando ? '⏳ Extrayendo…' : '✦ Extraer datos con IA'}
                </button>
                {parseStatus === 'ok' && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#e8f0eb', color: '#2d7a4f', borderRadius: 6, fontSize: 12 }}>Datos extraídos</div>
                )}
                {parseStatus === 'error' && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#fdf0ef', color: '#c0392b', borderRadius: 6, fontSize: 12 }}>Error al extraer</div>
                )}
              </div>

              <div style={s.row2}>
                <Campo label="Nombre y apellido *">
                  <input type="text" style={s.input} value={clienteForm.nombre}
                    onChange={e => setClienteForm(f => ({...f, nombre: e.target.value}))}
                    placeholder="Juan García" autoFocus />
                </Campo>
              </div>
              <div style={s.row2}>
                <Campo label="DNI">
                  <input type="text" style={s.input} value={clienteForm.dni}
                    onChange={e => setClienteForm(f => ({...f, dni: e.target.value}))}
                    placeholder="12345678" />
                </Campo>
                <Campo label="WhatsApp">
                  <input type="tel" style={s.input} value={clienteForm.whatsapp}
                    onChange={e => setClienteForm(f => ({...f, whatsapp: e.target.value}))}
                    placeholder="+54 9 11 1234-5678" />
                </Campo>
              </div>
              <div style={s.row2}>
                <Campo label="Email">
                  <input type="email" style={s.input} value={clienteForm.email}
                    onChange={e => setClienteForm(f => ({...f, email: e.target.value}))}
                    placeholder="juan@mail.com" />
                </Campo>
                <Campo label="Ciudad">
                  <input type="text" style={s.input} value={clienteForm.ciudad}
                    onChange={e => setClienteForm(f => ({...f, ciudad: e.target.value}))}
                    placeholder="Buenos Aires" />
                </Campo>
              </div>
              <div style={{ marginTop: 4 }}>
                <button style={s.linkBtn} onClick={() => setModoCliente('buscar')}>
                  ← Volver a búsqueda
                </button>
              </div>
            </>
          )}

          <div style={s.footerBtns}>
            <button style={s.btnSecundario} onClick={() => setPaso(0)}>← Atrás</button>
            <button
              style={s.btnPrimario}
              onClick={() => {
                const err = validarPaso2()
                if (err) return alert(err)
                setPaso(2)
              }}
            >
              Continuar →
            </button>
          </div>
        </Seccion>
      )}

      {/* ── PASO 2: Confirmar ──────────────────────────────────────────────── */}
      {paso === 2 && (
        <Seccion titulo="Confirmar reserva">

          {/* Resumen */}
          <div style={s.resumen}>
            <FilaResumen label="Propiedad"  value={propiedad?.nombre} />
            <FilaResumen label="Check-in"   value={formatFecha(checkin)} />
            <FilaResumen label="Check-out"  value={formatFecha(checkout)} />
            <FilaResumen label="Noches"     value={noches} />
            <FilaResumen label="Personas"   value={`${adultos} adultos${menores ? `, ${menores} menores` : ''}`} />
            {mascotas && <FilaResumen label="Mascotas" value="Sí" />}
            <FilaResumen label="Canal"      value={canal} />
            <FilaResumen label="Cliente"    value={clienteLabel} />
            <FilaResumen
              label="Estado"
              value={<span style={{
                background: ESTADOS.find(e => e.value === estado)?.bg,
                color: ESTADOS.find(e => e.value === estado)?.color,
                padding: '2px 10px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600
              }}>{ESTADOS.find(e => e.value === estado)?.label}</span>}
            />
          </div>

          {/* Precio */}
          <Campo label="Precio total *">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={s.prefijo}>$</span>
              <input
                type="number" min={0} step={1000}
                style={{...s.input, flex: 1}}
                placeholder="0"
                value={precioTotal}
                onChange={e => setPrecioTotal(e.target.value)}
                autoFocus
              />
            </div>
            {noches > 0 && precioTotal > 0 && (
              <div style={s.precioSub}>
                = ${(Number(precioTotal) / noches).toLocaleString('es-AR', {maximumFractionDigits: 0})} / noche
              </div>
            )}
          </Campo>

          {/* Estado */}
          <Campo label="Estado de la reserva">
            <div style={s.estadoGrid}>
              {ESTADOS.map(e => (
                <button
                  key={e.value}
                  type="button"
                  style={{
                    ...s.estadoBtn,
                    background: estado === e.value ? e.bg : '#f5f5f5',
                    color: estado === e.value ? e.color : '#666',
                    borderColor: estado === e.value ? e.color : '#ddd',
                    fontWeight: estado === e.value ? 600 : 400,
                  }}
                  onClick={() => setEstado(e.value)}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </Campo>

          {propiedad?.alias_cbu && (
            <div style={s.cbuBox}>
              <span style={s.cbuLabel}>Alias / CBU para seña</span>
              <div style={s.cbuValor}>{propiedad.alias_cbu}</div>
            </div>
          )}

          <Campo label="Notas internas (opcional)">
            <textarea
              style={{...s.input, minHeight: 72, resize: 'vertical'}}
              placeholder="Ej: cliente conocido, piden cuna, etc."
              value={notasInt}
              onChange={e => setNotasInt(e.target.value)}
            />
          </Campo>

          {guardError && <MensajeError texto={guardError} />}

          <div style={s.footerBtns}>
            <button style={s.btnSecundario} onClick={() => setPaso(1)}>← Atrás</button>
            <button
              style={{...s.btnPrimario, background: '#2E9E6B', opacity: guardando ? 0.7 : 1}}
              onClick={guardarReserva}
              disabled={guardando}
            >
              {guardando ? 'Guardando…' : '✓ Crear reserva'}
            </button>
          </div>
        </Seccion>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function Seccion({ titulo, children }) {
  return (
    <div style={s.seccion}>
      <h3 style={s.seccionTitulo}>{titulo}</h3>
      {children}
    </div>
  )
}

function Campo({ label, children }) {
  return (
    <div style={s.campo}>
      <label style={s.campoLabel}>{label}</label>
      {children}
    </div>
  )
}

function FilaResumen({ label, value }) {
  return (
    <div style={s.filaResumen}>
      <span style={s.filaLabel}>{label}</span>
      <span style={s.filaValor}>{value ?? '—'}</span>
    </div>
  )
}

function MensajeError({ texto }) {
  return <div style={s.errorBox}>{texto}</div>
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = {
  page:   { maxWidth: 640, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' },
  titulo: { fontSize: 22, fontWeight: 700, marginBottom: 24, letterSpacing: '-0.02em' },

  stepper:     { display: 'flex', alignItems: 'center', marginBottom: 32 },
  stepperItem: { display: 'flex', alignItems: 'center', flex: 1 },
  stepCircle:  { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 },
  stepLabel:   { fontSize: 12, marginLeft: 8, whiteSpace: 'nowrap' },
  stepLine:    { flex: 1, height: 2, background: '#e0e0e0', margin: '0 8px' },

  seccion:       { background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' },
  seccionTitulo: { fontSize: 15, fontWeight: 600, marginBottom: 20, marginTop: 0, color: '#444' },

  campo:      { marginBottom: 16 },
  campoLabel: { display: 'block', fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' },
  input:      { width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' },
  row2:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  checkLabel: { display: 'flex', alignItems: 'center', fontSize: 14, cursor: 'pointer' },
  warnText:   { color: '#D97706', fontSize: 12, marginLeft: 4 },

  nochesBadge: { background: '#e8f0eb', color: '#2d5a3d', fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 20, display: 'inline-block', marginBottom: 16 },

  dropdown:     { border: '1px solid #e0e0e0', borderRadius: 10, overflow: 'hidden', marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },
  dropdownItem: { padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 2 },
  dropdownNombre:{ fontSize: 14, fontWeight: 500 },
  dropdownSub:  { fontSize: 12, color: '#888' },

  clienteCard:       { background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 10, padding: '12px 16px', marginBottom: 16 },
  clienteCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  clienteCardNombre: { fontWeight: 600, fontSize: 15 },
  clienteCardSub:    { fontSize: 12, color: '#555', marginTop: 4, display: 'block' },

  resumen:     { background: '#f8f8f8', borderRadius: 10, padding: '14px 16px', marginBottom: 20 },
  filaResumen: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee', fontSize: 14 },
  filaLabel:   { color: '#666' },
  filaValor:   { fontWeight: 500 },

  prefijo:  { fontSize: 18, fontWeight: 600, color: '#888' },
  precioSub:{ fontSize: 12, color: '#888', marginTop: 4 },

  cbuBox:   { background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', marginBottom: 16 },
  cbuLabel: { display: 'block', fontSize: 11, fontWeight: 600, color: '#2d5a3d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 },
  cbuValor: { fontSize: 15, fontWeight: 600, letterSpacing: '0.04em' },

  estadoGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  estadoBtn:  { padding: '8px 14px', borderRadius: 20, border: '1px solid', fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' },

  exitoBox: { background: '#D1FAE5', color: '#065F46', borderRadius: 8, padding: '12px 16px', fontSize: 14, fontWeight: 500, marginBottom: 20, textAlign: 'center' },

  errorBox:    { background: '#FEE2E2', color: '#991B1B', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },

  footerBtns:   { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 20, borderTop: '1px solid #f0f0f0' },
  btnPrimario:  { padding: '10px 22px', borderRadius: 9, border: 'none', background: '#2d5a3d', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  btnSecundario:{ padding: '10px 22px', borderRadius: 9, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 14 },
  btnOutline:   { padding: '8px 16px', borderRadius: 8, border: '1px dashed #aaa', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#555' },
  linkBtn:      { background: 'none', border: 'none', color: '#2d5a3d', cursor: 'pointer', fontSize: 13, padding: 0, fontWeight: 500 },
}
