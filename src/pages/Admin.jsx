import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useSearchParams } from 'react-router-dom'

const SECCIONES = [
  { id: 'propiedades', label: '🏠 Propiedades' },
  { id: 'reservas',    label: '📅 Reservas' },
  { id: 'clientes',    label: '👥 Clientes' },
]

/** Definidos fuera del CRUD: si van adentro, cada tecla recrea el tipo y React pierde el foco del input. */
function AdminTextField({ label, campo, type = 'text', placeholder = '', editando, setEditando }) {
  return (
    <Campo label={label}>
      <input
        type={type}
        style={s.input}
        placeholder={placeholder}
        value={editando?.[campo] ?? ''}
        onChange={(e) =>
          setEditando((p) => ({
            ...p,
            [campo]: type === 'number' ? Number(e.target.value) : e.target.value,
          }))
        }
      />
    </Campo>
  )
}

function AdminCheckField({ label, campo, editando, setEditando }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginTop: 4 }}>
      <input
        type="checkbox"
        checked={!!editando?.[campo]}
        onChange={(e) => setEditando((p) => ({ ...p, [campo]: e.target.checked }))}
      />
      {label}
    </label>
  )
}

export default function Admin() {
  const [searchParams] = useSearchParams()
  const initialSeccion = searchParams.get('seccion') || 'propiedades'
  const [seccion, setSeccion] = useState(initialSeccion)

  useEffect(() => {
    const s = searchParams.get('seccion')
    if (s && ['propiedades', 'reservas', 'clientes'].includes(s)) {
      setSeccion(s)
    }
  }, [searchParams])

  return (
    <div style={s.page}>
      <h2 style={s.titulo}>Administración</h2>

      <div style={s.tabs}>
        {SECCIONES.map(sec => (
          <button
            key={sec.id}
            style={{ ...s.tab, ...(seccion === sec.id ? s.tabActive : {}) }}
            onClick={() => setSeccion(sec.id)}
          >
            {sec.label}
          </button>
        ))}
      </div>

      {seccion === 'propiedades' && <CRUDPropiedades />}
      {seccion === 'reservas'    && <CRUDReservas />}
      {seccion === 'clientes'    && <CRUDClientes />}
    </div>
  )
}

// ─── PROPIEDADES ──────────────────────────────────────────────────────────────
function CRUDPropiedades() {
  const [lista,    setLista]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [editando, setEditando] = useState(null) // null | {} | {id,...}
  const [guardando,setGuardando]= useState(false)
  const [toast,    setToast]    = useState('')

  const vacio = {
    nombre: '', tipo: 'depto', direccion: '', ubicacion: '', capacidad_max: 4,
    ambientes: 2, piso_unidad: '', capacidad_desc: '', distribucion: '',
    equipamiento: '', acepta_mascotas: false, alias_cbu: '', descripcion: '',
    restriccion_vehiculos: false, acompanantes: 3, activa: true, marca: '', intro_personalizado: '',
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2200) }

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('propiedades').select('*').order('nombre')
    setLista(data ?? [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  async function guardar() {
    setGuardando(true)
    const { id, created_at, ...campos } = editando
    const op = id
      ? supabase.from('propiedades').update(campos).eq('id', id)
      : supabase.from('propiedades').insert(campos)
    const { error } = await op
    setGuardando(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(id ? '✓ Propiedad actualizada' : '✓ Propiedad creada')
    setEditando(null)
    cargar()
  }

  async function toggleActiva(prop) {
    await supabase.from('propiedades').update({ activa: !prop.activa }).eq('id', prop.id)
    cargar()
  }

  if (editando !== null) return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <h3 style={s.cardTitulo}>{editando.id ? 'Editar propiedad' : 'Nueva propiedad'}</h3>
        <button style={s.btnCancelar} onClick={() => setEditando(null)}>Cancelar</button>
      </div>

      <div style={s.grid2}>
        <AdminTextField label="Nombre *" campo="nombre" placeholder="Depto 1 – Planta Baja" editando={editando} setEditando={setEditando} />
        <Campo label="Tipo">
          <select style={s.input} value={editando.tipo} onChange={e => setEditando(p => ({ ...p, tipo: e.target.value }))}>
            {['depto','casa','duplex','cabana'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Campo>
        <AdminTextField label="Dirección" campo="direccion" placeholder="Alameda 206 y 308, Villa Gesell" editando={editando} setEditando={setEditando} />
        <AdminTextField label="Ubicación (para mensajes)" campo="ubicacion" placeholder="Barrio Norte, cerca del centro…" editando={editando} setEditando={setEditando} />
        <AdminTextField label="Capacidad máx." campo="capacidad_max" type="number" placeholder="4" editando={editando} setEditando={setEditando} />
        <AdminTextField label="Ambientes" campo="ambientes" type="number" placeholder="2" editando={editando} setEditando={setEditando} />
        <AdminTextField label="Piso / Unidad" campo="piso_unidad" placeholder="PB, 2°A…" editando={editando} setEditando={setEditando} />
        <AdminTextField label="Alias / CBU" campo="alias_cbu" placeholder="maratano.mp" editando={editando} setEditando={setEditando} />
        <AdminTextField label="Link web (fotos)" campo="link_web" placeholder="https://deptosnorte.com/depto-1" editando={editando} setEditando={setEditando} />
        <AdminTextField label="Acompañantes (para ficha)" campo="acompanantes" type="number" placeholder="3" editando={editando} setEditando={setEditando} />
        <AdminTextField label="Marca (si no es Deptos Norte)" campo="marca" placeholder="San Bernardo" editando={editando} setEditando={setEditando} />
      </div>

      <Campo label="Capacidad (texto para mensajes)" style={{ marginTop: 12 }}>
        <input style={s.input} placeholder="2 ambientes, máximo 4 personas"
          value={editando.capacidad_desc ?? ''}
          onChange={e => setEditando(p => ({ ...p, capacidad_desc: e.target.value }))} />
      </Campo>

      <Campo label="Distribución" style={{ marginTop: 12 }}>
        <textarea style={{ ...s.input, minHeight: 72, resize: 'vertical' }}
          placeholder="• 1 dormitorio matrimonial&#10;• 1 cama individual"
          value={editando.distribucion ?? ''}
          onChange={e => setEditando(p => ({ ...p, distribucion: e.target.value }))} />
      </Campo>

      <Campo label="Equipamiento" style={{ marginTop: 12 }}>
        <textarea style={{ ...s.input, minHeight: 88, resize: 'vertical' }}
          placeholder="• TV Smart&#10;• Parrilla&#10;• WiFi"
          value={editando.equipamiento ?? ''}
          onChange={e => setEditando(p => ({ ...p, equipamiento: e.target.value }))} />
      </Campo>

      <Campo label="Intro personalizado (para ficha)" style={{ marginTop: 12 }}>
        <textarea style={{ ...s.input, minHeight: 60, resize: 'vertical' }}
          placeholder="Gracias por reservar…"
          value={editando.intro_personalizado ?? ''}
          onChange={e => setEditando(p => ({ ...p, intro_personalizado: e.target.value }))} />
      </Campo>

      <div style={{ marginTop: 16, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <AdminCheckField label="Acepta mascotas" campo="acepta_mascotas" editando={editando} setEditando={setEditando} />
        <AdminCheckField label="Restricción vehículos" campo="restriccion_vehiculos" editando={editando} setEditando={setEditando} />
        <AdminCheckField label="Activa" campo="activa" editando={editando} setEditando={setEditando} />
      </div>

      <div style={s.footerBtns}>
        <button style={s.btnCancelar} onClick={() => setEditando(null)}>Cancelar</button>
        <button style={s.btnPrimario} onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : '✓ Guardar'}
        </button>
      </div>

      <Toast msg={toast} />
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button style={s.btnPrimario} onClick={() => setEditando({ ...vacio })}>+ Nueva propiedad</button>
      </div>
      {loading ? <Cargando /> : (
        <div style={s.card}>
          {lista.length === 0 && <div style={s.empty}>No hay propiedades cargadas.</div>}
          {lista.map(p => (
            <div key={p.id} style={s.fila}>
              <div style={s.filaInfo}>
                <span style={s.filaNombre}>{p.nombre}</span>
                <span style={s.filaSub}>{p.tipo} · cap. {p.capacidad_max || '?'} · {p.direccion || 'sin dirección'}</span>
              </div>
              <div style={s.filaAcciones}>
                <span style={{ ...s.badge, background: p.activa ? '#D1FAE5' : '#FEE2E2', color: p.activa ? '#065F46' : '#991B1B' }}>
                  {p.activa ? 'Activa' : 'Inactiva'}
                </span>
                <button style={s.btnSm} onClick={() => setEditando({ ...p })}>Editar</button>
                <button style={s.btnSm} onClick={() => toggleActiva(p)}>
                  {p.activa ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Toast msg={toast} />
    </div>
  )
}

// ─── RESERVAS ─────────────────────────────────────────────────────────────────
function CRUDReservas() {
  const [lista,        setLista]        = useState([])
  const [propiedades,  setPropiedades]  = useState([])
  const [clientes,     setClientes]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [editando,     setEditando]     = useState(null)
  const [detalle,      setDetalle]      = useState(null)
  const [guardando,    setGuardando]    = useState(false)
  const [toast,        setToast]        = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todas')
  const [filtroProp,   setFiltroProp]   = useState('todas')

  const [searchParams, setSearchParams] = useSearchParams()
  const editReservaId = searchParams.get('reserva_id')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2200) }

  async function cargar() {
    setLoading(true)
    const hoy = new Date().toISOString().split('T')[0]

    // Automatización: Finalizar reservas cuya fecha de checkout ya pasó
    await supabase
      .from('reservas')
      .update({ estado: 'finalizada' })
      .lt('checkout', hoy)
      .not('estado', 'in', '("finalizada","cancelada")')

    const [resRes, resProp, resClientes] = await Promise.all([
      supabase
        .from('reservas')
        .select('*, clientes(nombre, apellido, whatsapp), propiedades(id, nombre)')
        .order('checkin', { ascending: false })
        .limit(100),
      supabase.from('propiedades').select('id, nombre').order('nombre'),
      supabase.from('clientes').select('id, nombre, apellido, dni').order('nombre')
    ])
    setLista(resRes.data ?? [])
    setPropiedades(resProp.data ?? [])
    setClientes(resClientes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  // Auto-abrir reserva para editar si viene en la URL
  useEffect(() => {
    if (editReservaId && lista.length > 0 && !editando) {
      const res = lista.find(r => String(r.id) === String(editReservaId))
      if (res) {
        setEditando({ ...res })
        // Limpiar el parámetro de la URL
        const newParams = new URLSearchParams(searchParams)
        newParams.delete('reserva_id')
        setSearchParams(newParams)
      }
    }
  }, [editReservaId, lista, editando, searchParams, setSearchParams])

  async function guardar() {
    if (!editando.cliente_id) { showToast('Seleccioná un cliente'); return }
    if (!editando.propiedad_id) { showToast('Seleccioná una propiedad'); return }
    setGuardando(true)
    const { clientes, propiedades, created_at, noches, ...campos } = editando
    let error
    if (editando.id) {
      ({ error } = await supabase.from('reservas').update(campos).eq('id', editando.id))
    } else {
      ({ error } = await supabase.from('reservas').insert(campos))
    }
    setGuardando(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(editando.id ? '✓ Reserva actualizada' : '✓ Reserva creada')
    setEditando(null)
    setDetalle(null)
    cargar()
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar esta reserva?')) return
    await supabase.from('pagos').delete().eq('reserva_id', id)
    await supabase.from('reservas').delete().eq('id', id)
    setEditando(null)
    setDetalle(null)
    showToast('Reserva eliminada')
    cargar()
  }

  function calcularNoches(checkin, checkout) {
    if (!checkin || !checkout) return 0
    const diff = new Date(checkout) - new Date(checkin)
    return Math.round(diff / (1000 * 60 * 60 * 24))
  }

  const ESTADOS = ['pendiente', 'confirmada', 'finalizada']

  const COLORES_ESTADO = {
    pendiente:  { bg: '#F3E8FF', color: '#6B21A8' },
    confirmada: { bg: '#D1FAE5', color: '#065F46' },
    finalizada: { bg: '#F3F4F6', color: '#374151' },
    // Soporte para colores viejos si existen en la BD todavía
    señada:     { bg: '#FEF3C7', color: '#92400E' },
    activa:     { bg: '#DBEAFE', color: '#1E40AF' },
    cerrada:    { bg: '#E5E7EB', color: '#4B5563' },
    cancelada:  { bg: '#FEE2E2', color: '#991B1B' },
  }

  const ESTADO_LABELS = {
    pendiente: 'Pendiente',
    confirmada: 'Confirmada',
    finalizada: 'Finalizada',
    // Soporte para labels viejos
    señada: 'Seña',
    activa: 'Activa',
    cerrada: 'Cerrada',
    cancelada: 'Cancelada',
  }

  const vacio = {
    propiedad_id: propiedades[0]?.id || '',
    cliente_id: '',
    checkin: '',
    checkout: '',
    adultos: 1,
    menores: 0,
    mascotas: false,
    precio_total: '',
    estado: 'pendiente',
    notas_internas: '',
    canal_origen: 'manual',
  }

  if (editando) return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <h3 style={s.cardTitulo}>{editando.id ? 'Editar reserva' : 'Nueva reserva'}</h3>
        <button style={s.btnCancelar} onClick={() => setEditando(null)}>Cancelar</button>
      </div>

      <div style={s.grid2}>
        <Campo label="Cliente *">
          <select style={s.input} value={editando.cliente_id ?? ''}
            onChange={e => setEditando(p => ({ ...p, cliente_id: e.target.value }))}>
            <option value="">— Elegí un cliente —</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>
                {c.nombre} {c.apellido} {c.dni ? `· DNI ${c.dni}` : ''}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Propiedad *">
          <select style={s.input} value={editando.propiedad_id ?? ''}
            onChange={e => setEditando(p => ({ ...p, propiedad_id: e.target.value }))}>
            <option value="">— Elegí —</option>
            {propiedades.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>
        <Campo label="Estado">
          <select style={s.input} value={editando.estado ?? 'señada'}
            onChange={e => setEditando(p => ({ ...p, estado: e.target.value }))}>
            {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
          </select>
        </Campo>
        <Campo label="Canal">
          <select style={s.input} value={editando.canal_origen ?? 'manual'}
            onChange={e => setEditando(p => ({ ...p, canal_origen: e.target.value }))}>
            <option value="manual">Manual</option>
            <option value="booking">Booking</option>
            <option value="airbnb">Airbnb</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="telefono">Teléfono</option>
          </select>
        </Campo>
        <Campo label="Check-in">
          <input type="date" style={s.input} value={editando.checkin ?? ''}
            onChange={e => setEditando(p => ({ ...p, checkin: e.target.value }))} />
        </Campo>
        <Campo label="Check-out">
          <input type="date" style={s.input} value={editando.checkout ?? ''}
            onChange={e => setEditando(p => ({ ...p, checkout: e.target.value }))} />
        </Campo>
        <Campo label="Adultos">
          <input type="number" style={s.input} value={editando.adultos ?? 1}
            onChange={e => setEditando(p => ({ ...p, adultos: Number(e.target.value) }))} />
        </Campo>
        <Campo label="Menores">
          <input type="number" style={s.input} value={editando.menores ?? 0}
            onChange={e => setEditando(p => ({ ...p, menores: Number(e.target.value) }))} />
        </Campo>
        <Campo label="Precio total">
          <input type="number" style={s.input} value={editando.precio_total ?? ''}
            onChange={e => setEditando(p => ({ ...p, precio_total: Number(e.target.value) }))} />
        </Campo>
      </div>

      <Campo label="Notas internas" style={{ marginTop: 12 }}>
        <textarea style={{ ...s.input, minHeight: 72, resize: 'vertical' }}
          value={editando.notas_internas ?? ''}
          onChange={e => setEditando(p => ({ ...p, notas_internas: e.target.value }))} />
      </Campo>

      <div style={s.footerBtns}>
        {editando.id && (
          <button style={{ ...s.btnSm, color: '#991B1B' }} onClick={() => eliminar(editando.id)}>
            Eliminar
          </button>
        )}
        <button style={s.btnCancelar} onClick={() => setEditando(null)}>Cancelar</button>
        <button style={s.btnPrimario} onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : '✓ Guardar'}
        </button>
      </div>
      <Toast msg={toast} />
    </div>
  )

  function fmt(str) {
    if (!str) return '—'
    const [y, m, d] = str.split('-')
    return `${d}/${m}/${y}`
  }

  const reservasFiltradas = lista.filter(r => {
    if (filtroEstado !== 'todas' && r.estado !== filtroEstado) return false
    if (filtroProp !== 'todas' && r.propiedad_id !== filtroProp) return false
    return true
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...s.input, width: 160 }} value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}>
          <option value="todas">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
        </select>
        <select style={{ ...s.input, width: 220 }} value={filtroProp}
          onChange={e => setFiltroProp(e.target.value)}>
          <option value="todas">Todas las propiedades</option>
          {propiedades.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: '#888' }}>{reservasFiltradas.length} reserva(s)</span>
      </div>

      {loading ? <Cargando /> : (
        <div style={s.card}>
          {reservasFiltradas.length === 0 && (
            <div style={s.empty}>
              {lista.length === 0 ? 'No hay reservas.' : 'No hay reservas con esos filtros.'}
            </div>
          )}
          {reservasFiltradas.map(r => {
            const ce = COLORES_ESTADO[r.estado] ?? { bg: '#f0f0f0', color: '#333' }
            return (
              <div key={r.id} style={s.fila} className="fila-clickeable"
                onClick={() => setDetalle(r)}>
                <div style={s.filaInfo}>
                  <span style={s.filaNombre}>
                    {r.clientes?.nombre} {r.clientes?.apellido}
                  </span>
                  <span style={s.filaSub}>
                    {r.propiedades?.nombre} · {fmt(r.checkin)} → {fmt(r.checkout)} · {r.noches} noches
                    {r.precio_total ? ` · $${Number(r.precio_total).toLocaleString('es-AR')}` : ''}
                  </span>
                </div>
                <div style={s.filaAcciones} onClick={e => e.stopPropagation()}>
                  <span style={{ ...s.badge, background: ce.bg, color: ce.color }}>{ESTADO_LABELS[r.estado] || r.estado}</span>
                  <button style={s.btnSm} onClick={() => { setEditando({ ...r }); setDetalle(null) }}>Editar</button>
                </div>
              </div>
            )
          })}
          {reservasFiltradas.length > 0 && (
            <div style={{ padding: '10px 4px', fontSize: 12, color: '#888', textAlign: 'right' }}>
              {reservasFiltradas.length} reserva(s)
            </div>
          )}
        </div>
      )}

      {detalle && !editando && (
        <ModalDetalleReserva
          reserva={detalle}
          propiedades={propiedades}
          estados={ESTADOS}
          estadoLabels={ESTADO_LABELS}
          coloresEstado={COLORES_ESTADO}
          onClose={() => setDetalle(null)}
          onEditar={() => { setEditando({ ...detalle }); setDetalle(null) }}
          onCambiarEstado={async (nuevoEstado) => {
            if (nuevoEstado === 'eliminar') {
              await supabase.from('pagos').delete().eq('reserva_id', detalle.id)
              await supabase.from('reservas').delete().eq('id', detalle.id)
              showToast('Reserva eliminada')
              setDetalle(null)
            } else {
              await supabase.from('reservas').update({ estado: nuevoEstado }).eq('id', detalle.id)
              showToast('Estado actualizado')
            }
            cargar()
          }}
        />
      )}

      <Toast msg={toast} />
    </div>
  )
}

function ModalDetalleReserva({ reserva: r, propiedades, estados, estadoLabels, coloresEstado, onClose, onEditar, onCambiarEstado }) {
  const waLink = r.clientes?.whatsapp
    ? `https://wa.me/${r.clientes.whatsapp.replace(/\D/g, '')}`
    : null

  function fmt(str) {
    if (!str) return '—'
    const [y, m, d] = str.split('-')
    return `${d}/${m}/${y}`
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.modal, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <div>
            <div style={s.modalNombre}>{r.clientes?.nombre} {r.clientes?.apellido}</div>
            <div style={s.modalPropiedad}>{r.propiedades?.nombre}</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.modalBody}>
          <div style={s.modalGrid}>
            <DatoModal label="Check-in" value={fmt(r.checkin)} />
            <DatoModal label="Check-out" value={fmt(r.checkout)} />
            <DatoModal label="Noches" value={r.noches} />
            <DatoModal label="Adultos" value={r.adultos} />
            {r.menores > 0 && <DatoModal label="Menores" value={r.menores} />}
            {r.mascotas && <DatoModal label="Mascotas" value="Sí" />}
            <DatoModal
              label="Total"
              value={r.precio_total ? `$${Number(r.precio_total).toLocaleString('es-AR')}` : '—'}
              highlight
            />
            <DatoModal label="Canal" value={r.canal_origen || '—'} />
          </div>

          {r.notas_internas && (
            <div style={s.notasBox}>
              <span style={s.notasLabel}>Notas</span>
              {r.notas_internas}
            </div>
          )}

          <div style={s.estadosSection}>
            <div style={s.estadosLabel}>Cambiar estado</div>
            <div style={s.estadosBtns}>
              {estados.map(est => {
                const ce = coloresEstado[est]
                const esActivo = r.estado === est
                return (
                  <button
                    key={est}
                    onClick={() => onCambiarEstado(est)}
                    style={{
                      ...s.estadoBtn,
                      background: ce.bg,
                      color: ce.color,
                      opacity: esActivo ? 1 : 0.6,
                      fontWeight: esActivo ? 600 : 400,
                    }}
                  >
                    {estadoLabels[est]}
                  </button>
                )
              })}
            </div>
          </div>

          <button
            onClick={() => {
              if (confirm('¿Eliminar esta reserva?')) {
                onCambiarEstado('eliminar')
              }
            }}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              background: '#fee2e2',
              color: '#991b1b',
              border: '1px solid #fca5a5',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              width: '100%',
            }}
          >
            Eliminar reserva
          </button>
        </div>

        <div style={s.modalFooter}>
          {waLink && (
            <a href={waLink} target="_blank" rel="noreferrer" style={s.btnWA}>
              WhatsApp
            </a>
          )}
          <button style={s.btnPrimario} onClick={onEditar}>Editar</button>
          <button style={s.btnCancelar} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

function DatoModal({ label, value, highlight }) {
  return (
    <div>
      <div style={s.datoLabel}>{label}</div>
      <div style={{ ...s.datoValor, color: highlight ? '#2d5a3d' : 'inherit', fontWeight: highlight ? 600 : 500 }}>
        {value}
      </div>
    </div>
  )
}

// ─── CLIENTES ─────────────────────────────────────────────────────────────────
function CRUDClientes() {
  const [lista,    setLista]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [editando, setEditando] = useState(null)
  const [guardando,setGuardando]= useState(false)
  const [toast,    setToast]    = useState('')
  const [busqueda, setBusqueda] = useState('')

  // IA parser
  const [fichaTexto, setFichaTexto] = useState('')
  const [parseando, setParseando] = useState(false)
  const [parseStatus, setParseStatus] = useState(null)
  const [parseMsg, setParseMsg] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2200) }

  async function cargar(q = '') {
    setLoading(true)
    let query = supabase.from('clientes').select('*').order('nombre')
    if (q.length >= 2) {
      query = query.or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,dni.ilike.%${q}%`)
    }
    const { data } = await query.limit(100)
    setLista(data ?? [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  useEffect(() => {
    const t = setTimeout(() => cargar(busqueda), 300)
    return () => clearTimeout(t)
  }, [busqueda])

  async function guardar() {
    setGuardando(true)
    const { id, created_at, ...campos } = editando
    const { error } = id
      ? await supabase.from('clientes').update(campos).eq('id', id)
      : await supabase.from('clientes').insert(campos)
    setGuardando(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('✓ Cliente guardado')
    setEditando(null)
    cargar(busqueda)
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este cliente?')) return
    const { error } = await supabase.from('clientes').delete().eq('id', id)
    if (error) { showToast('No se puede eliminar: tiene reservas asociadas'); return }
    showToast('Cliente eliminado')
    cargar(busqueda)
  }

  async function parsearFicha() {
    if (!fichaTexto.trim()) {
      showToast('Pegá el texto de la ficha primero')
      return
    }

    setParseando(true)
    setParseStatus(null)

    try {
      const res = await fetch('https://deptos-proxy.vercel.app/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: fichaTexto }),
      })

      if (!res.ok) throw new Error('HTTP ' + res.status)

      const parsed = await res.json()

      if (parsed.nombre) setEditando(e => ({ ...e, nombre: parsed.nombre }))
      if (parsed.dni) setEditando(e => ({ ...e, dni: parsed.dni }))
      if (parsed.direccion) setEditando(e => ({ ...e, domicilio: parsed.direccion }))
      if (parsed.localidad) setEditando(e => ({ ...e, ciudad: parsed.localidad }))
      if (parsed.tel) setEditando(e => ({ ...e, whatsapp: parsed.tel }))
      if (parsed.email) setEditando(e => ({ ...e, email: parsed.email }))

      setParseStatus('ok')
      setParseMsg('Datos extraídos correctamente')
    } catch (err) {
      setParseStatus('error')
      setParseMsg('No se pudieron extraer los datos')
    } finally {
      setParseando(false)
    }
  }

  function exportarCSV() {
    if (!lista.length) { showToast('No hay datos'); return }
    const cols = ['nombre', 'apellido', 'dni', 'email', 'whatsapp', 'domicilio', 'ciudad', 'vehiculo_patente', 'notas', 'created_at']
    const csv = [cols.join(';'), ...lista.map(r => cols.map(c => `"${(r[c] ?? '').toString().replace(/"/g, '""')}"`).join(';'))].join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv)
    a.download = 'clientes.csv'
    a.click()
  }

  const vacio = { nombre:'', dni:'', email:'', whatsapp:'', domicilio:'', ciudad:'', vehiculo_patente:'', notas:'', es_repetidor: false }

  if (editando !== null) return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <h3 style={s.cardTitulo}>{editando.id ? 'Editar cliente' : 'Nuevo cliente'}</h3>
        <button style={s.btnCancelar} onClick={() => setEditando(null)}>Cancelar</button>
      </div>

      {/* IA Parser para nuevo cliente */}
      {!editando.id && (
        <div style={{ marginBottom: 20, padding: 16, background: '#fafafa', borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#666' }}>✦ EXTRAER DESDE FICHA</div>
          <textarea
            style={{ ...s.input, minHeight: 80, resize: 'vertical', marginBottom: 10 }}
            placeholder="Pegá el texto de la ficha del cliente (WhatsApp, email, lo que sea)…"
            value={fichaTexto}
            onChange={(e) => setFichaTexto(e.target.value)}
          />
          <button style={{ ...s.btnPrimario, width: '100%', background: '#2d5a3d' }} onClick={parsearFicha} disabled={parseando}>
            {parseando ? '⏳ Extrayendo…' : '✦ Extraer datos con IA'}
          </button>
          {parseStatus === 'ok' && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#e8f0eb', color: '#2d7a4f', borderRadius: 6, fontSize: 13 }}>{parseMsg}</div>
          )}
          {parseStatus === 'error' && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#fdf0ef', color: '#c0392b', borderRadius: 6, fontSize: 13 }}>{parseMsg}</div>
          )}
        </div>
      )}

      <div style={s.grid2}>
        <AdminTextField label="Nombre y apellido" campo="nombre" placeholder="Juan García" editando={editando} setEditando={setEditando} />
        <AdminTextField label="DNI" campo="dni" placeholder="28.456.789" editando={editando} setEditando={setEditando} />
        <AdminTextField label="WhatsApp" campo="whatsapp" placeholder="+54 9 11 1234-5678" editando={editando} setEditando={setEditando} />
        <AdminTextField label="Email" campo="email" placeholder="juan@mail.com" editando={editando} setEditando={setEditando} />
        <AdminTextField label="Ciudad" campo="ciudad" placeholder="Buenos Aires" editando={editando} setEditando={setEditando} />
        <AdminTextField label="Domicilio" campo="domicilio" placeholder="Av. Rivadavia 1234" editando={editando} setEditando={setEditando} />
        <AdminTextField label="Domicilio" campo="domicilio" placeholder="Av. Rivadavia 1234" editando={editando} setEditando={setEditando} />
        <AdminTextField label="Patente vehículo" campo="vehiculo_patente" placeholder="AA123BB" editando={editando} setEditando={setEditando} />
      </div>
      <Campo label="Notas" style={{ marginTop: 12 }}>
        <textarea style={{ ...s.input, minHeight: 60, resize: 'vertical' }}
          value={editando.notas ?? ''}
          onChange={e => setEditando(p => ({ ...p, notas: e.target.value }))} />
      </Campo>
      <div style={s.footerBtns}>
        {editando.id && (
          <button style={{ ...s.btnSm, color: '#991B1B' }} onClick={() => eliminar(editando.id)}>
            Eliminar
          </button>
        )}
        <button style={s.btnCancelar} onClick={() => setEditando(null)}>Cancelar</button>
        <button style={s.btnPrimario} onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : '✓ Guardar'}
        </button>
      </div>
      <Toast msg={toast} />
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <input style={{ ...s.input, flex: 1 }} placeholder="Buscar por nombre, apellido o DNI…"
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <button style={s.btnSm} onClick={exportarCSV}>⬇ CSV</button>
        <button style={s.btnPrimario} onClick={() => { setEditando({ ...vacio }); setFichaTexto(''); setParseStatus(null) }}>+ Nuevo</button>
      </div>
      {loading ? <Cargando /> : (
        <div style={s.card}>
          {lista.length === 0 && <div style={s.empty}>No se encontraron clientes.</div>}
          {lista.map(c => (
            <div key={c.id} style={s.fila}>
              <div style={s.filaInfo}>
                <span style={s.filaNombre}>{c.nombre} {c.apellido}</span>
                <span style={s.filaSub}>DNI {c.dni || '—'} · {c.whatsapp || 'sin WhatsApp'} · {c.ciudad || ''}</span>
              </div>
              <div style={s.filaAcciones}>
                <button style={s.btnSm} onClick={() => setEditando({ ...c })}>Editar</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: '8px 0', fontSize: 12, color: '#888', textAlign: 'right' }}>{lista.length} cliente(s)</div>
      <Toast msg={toast} />
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function Campo({ label, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Cargando() {
  return <div style={{ padding: 32, textAlign: 'center', color: '#888', fontSize: 14 }}>Cargando…</div>
}

function Toast({ msg }) {
  if (!msg) return null
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: '#1a1a1a', color: '#fff', padding: '10px 20px',
      borderRadius: 99, fontSize: 13, fontWeight: 500, zIndex: 200,
    }}>
      {msg}
    </div>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = {
  page:   { maxWidth: 860, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' },
  titulo: { fontSize: 22, fontWeight: 700, marginBottom: 20, letterSpacing: '-0.02em' },

  tabs: { display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' },
  tab:  { padding: '8px 16px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#555' },
  tabActive: { background: '#2d5a3d', borderColor: '#2d5a3d', color: '#fff' },

  card:       { background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  cardTitulo: { fontSize: 16, fontWeight: 600, margin: 0 },

  fila:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 4px', borderBottom: '1px solid #f0f0f0', gap: 12, flexWrap: 'wrap' },
  filaInfo:    { display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 },
  filaNombre:  { fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  filaSub:     { fontSize: 12, color: '#888' },
  filaAcciones:{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },

  badge: { fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600 },
  empty: { padding: 32, textAlign: 'center', color: '#aaa', fontSize: 14 },

  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },

  input: {
    width: '100%', padding: '9px 12px', border: '1px solid #ddd',
    borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box', background: '#fafafa',
    appearance: 'none',
  },

  footerBtns:   { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0f0' },
  btnPrimario:  { padding: '9px 20px', borderRadius: 8, border: 'none', background: '#1a1a1a', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  btnCancelar:  { padding: '9px 20px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 14 },
  btnSm:        { padding: '6px 14px', borderRadius: 7, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13 },

  overlay:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal:        { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460, boxShadow: '0 24px 64px rgba(0,0,0,0.18)', overflow: 'hidden' },
  modalHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px', borderBottom: '1px solid #f0f0f0' },
  modalNombre:  { fontSize: 18, fontWeight: 700 },
  modalPropiedad:{ fontSize: 13, color: '#888', marginTop: 2 },
  closeBtn:     { border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: '#bbb', padding: 0 },
  modalBody:    { padding: '16px 24px' },
  modalGrid:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px', marginBottom: 16 },
  datoLabel:    { fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 },
  datoValor:    { fontSize: 14, fontWeight: 500 },
  notasBox:     { background: '#f8f8f8', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#555', marginBottom: 16 },
  notasLabel:   { display: 'block', fontWeight: 600, color: '#333', marginBottom: 4, fontSize: 11, textTransform: 'uppercase' },
  estadosSection:{ borderTop: '1px solid #f0f0f0', paddingTop: 14 },
  estadosLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 },
  estadosBtns:  { display: 'flex', gap: 6, flexWrap: 'wrap' },
  estadoBtn:    { fontSize: 12, padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer' },
  modalFooter:  { display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 24px', borderTop: '1px solid #f0f0f0' },
  btnWA:        { padding: '8px 18px', borderRadius: 8, background: '#25D366', color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 500 },
}
