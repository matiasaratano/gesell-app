import { useState, useEffect, useRef } from 'react'
import { supabase, supabaseAutomatico } from '../lib/supabase'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import CobrosReserva from '../components/CobrosReserva'
import { useConfirmacion } from '../lib/confirmacion.js'
import { avisoCapacidad } from '../lib/capacidad.js'
import './admin-listas.css'

const SECCIONES = [
  { id: 'propiedades', label: '🏠 Propiedades' },
  { id: 'reservas',    label: '📅 Reservas' },
  { id: 'clientes',    label: '👥 Clientes' },
]

function nombreCanal(canal) {
  if (canal === 'booking') return 'Booking'
  if (canal === 'airbnb') return 'Airbnb'
  if (canal === 'directo' || canal === 'manual') return 'Manual'
  return canal ? canal.charAt(0).toUpperCase() + canal.slice(1) : 'Manual'
}

function esCierreManual(r) {
  return r?.estado === 'cerrada' && ['directo', 'manual'].includes(r.canal_origen)
}

function tipoCierreReserva(r) {
  return `Cierre ${nombreCanal(r?.canal_origen)}`
}

function padZ(n) {
  return String(n).padStart(2, '0')
}

function hoyStr() {
  const d = new Date()
  return `${d.getFullYear()}-${padZ(d.getMonth() + 1)}-${padZ(d.getDate())}`
}

function nombreReservaAdmin(r) {
  const cliente = `${r.clientes?.nombre || ''} ${r.clientes?.apellido || ''}`.trim()
  if (cliente) return cliente
  if (r.estado === 'cerrada') return tipoCierreReserva(r)
  return 'Sin cliente — asignar'
}

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
    <div className="page-admin" style={s.page}>
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
  const confirmar = useConfirmacion()
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

  async function eliminarPropiedad(prop) {
    if (!await confirmar(`¿Eliminar permanentemente "${prop.nombre}"? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('propiedades').delete().eq('id', prop.id)
    if (error) { showToast('No se puede eliminar: ' + error.message); return }
    showToast('Propiedad eliminada')
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
        <div className="admin-lista">
          {lista.length === 0 && <div style={s.empty}>No hay propiedades cargadas.</div>}
          {lista.length > 0 && <table className="admin-tabla admin-tabla-propiedades"><caption className="admin-sr-only">Propiedades</caption>
            <thead><tr><th>Departamento</th><th>Tipo</th><th>Capacidad</th><th>Dirección</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>{lista.map(p => (
            <tr key={p.id} className={!p.activa ? 'admin-fila-inactiva' : ''}>
              <td className="admin-identidad"><button className="admin-nombre" onClick={() => setEditando({ ...p })} aria-label={`Editar ${p.nombre}`}>{p.nombre}</button></td>
              <td data-label="Tipo">{p.tipo === 'depto' ? 'Departamento' : p.tipo === 'duplex' ? 'Dúplex' : p.tipo || '—'}</td>
              <td data-label="Capacidad">{p.capacidad_max || '—'}</td>
              <td data-label="Dirección">{p.direccion || 'Sin dirección'}</td>
              <td data-label="Estado">{p.activa ? 'Activa' : 'Inactiva'}</td>
              <td className="admin-prop-acciones"><div style={s.filaAcciones}>
                <button style={s.btnSm} onClick={() => toggleActiva(p)}>
                  {p.activa ? 'Desactivar' : 'Activar'}
                </button>
                <button style={{ ...s.btnSm, color: '#991B1B', borderColor: '#fca5a5' }} onClick={() => eliminarPropiedad(p)}>
                  Eliminar
                </button>
              </div></td>
            </tr>
          ))}</tbody></table>}
        </div>
      )}
      <Toast msg={toast} />
    </div>
  )
}

// ─── RESERVAS ─────────────────────────────────────────────────────────────────
export function CRUDReservas({ reservaInicial = null, onSaved, onCancel, onDeleted } = {}) {
  const confirmar = useConfirmacion()
  const navigate = useNavigate()
  const [lista,        setLista]        = useState([])
  const [propiedades,  setPropiedades]  = useState([])
  const [clientes,     setClientes]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [editando,     setEditando]     = useState(reservaInicial)
  const [busquedaCli,  setBusquedaCli]  = useState('')
  const [mostrarDropdownCli, setMostrarDropdownCli] = useState(false)

  useEffect(() => {
    if (editando && clientes.length > 0) {
      const c = clientes.find(x => x.id === editando.cliente_id)
      setBusquedaCli(c ? `${c.nombre} ${c.apellido || ''}` : '')
    } else {
      setBusquedaCli('')
    }
  }, [editando, clientes])
  const [detalle,      setDetalle]      = useState(null)
  const [guardando,    setGuardando]    = useState(false)
  const [toast,        setToast]        = useState('')
  const [filtroEstado, setFiltroEstado] = useState('operativas')
  const [filtroProp,   setFiltroProp]   = useState('todas')
  const [ordenRes,     setOrdenRes]     = useState('checkin_asc')

  const [creandoCliModal, setCreandoCliModal] = useState(false)
  const [nuevoCliData, setNuevoCliData] = useState({
    nombre: '', apellido: '', whatsapp: '', dni: '', email: '', ciudad: ''
  })
  const [guardandoCliRapido, setGuardandoCliRapido] = useState(false)

  const [searchParams] = useSearchParams()
  const editReservaId = searchParams.get('reserva_id')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2200) }

  async function guardarNuevoClienteRapido(e) {
    if (e) e.preventDefault()
    if (!nuevoCliData.nombre.trim()) {
      showToast('El nombre del cliente es obligatorio')
      return
    }
    setGuardandoCliRapido(true)
    const { data, error } = await supabase
      .from('clientes')
      .insert({
        nombre: nuevoCliData.nombre.trim(),
        apellido: nuevoCliData.apellido.trim() || null,
        whatsapp: nuevoCliData.whatsapp.trim() || null,
        dni: nuevoCliData.dni.trim() || null,
        email: nuevoCliData.email.trim() || null,
        ciudad: nuevoCliData.ciudad.trim() || null,
      })
      .select()
      .single()

    setGuardandoCliRapido(false)
    if (error) {
      showToast('Error al crear cliente: ' + error.message)
      return
    }

    const clienteCreado = data
    setClientes(prev => [...prev, clienteCreado].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')))
    setEditando(prev => ({ ...prev, cliente_id: clienteCreado.id }))
    setBusquedaCli(`${clienteCreado.nombre} ${clienteCreado.apellido || ''}`.trim())
    setMostrarDropdownCli(false)
    setCreandoCliModal(false)
    showToast('✓ Cliente creado y asignado')
  }

  async function cargar() {
    setLoading(true)
    const hoy = hoyStr()

    // Automatización: Finalizar reservas cuya fecha de checkout ya pasó
    // (excluye 'cerrada' para no tocar bloqueos de plataforma)
    await supabaseAutomatico
      .from('reservas')
      .update({ estado: 'finalizada' })
      .lt('checkout', hoy)
      .not('estado', 'in', '("finalizada","cancelada","cerrada")')

    const [resRes, resProp, resClientes] = await Promise.all([
      supabase
        .from('reservas')
        .select('*, clientes(nombre, apellido, whatsapp), propiedades(id, nombre)')
        .order('checkin', { ascending: true })
        .limit(200),
      supabase.from('propiedades').select('id, nombre, capacidad_max').order('nombre'),
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
        navigate(`/reservas/${res.id}${searchParams.get('accion') === 'asignar-inquilino' ? '?accion=asignar-inquilino' : ''}`, { replace: true })
      }
    }
  }, [editReservaId, lista, editando, searchParams, navigate])

  async function guardar() {
    if (editando.estado !== 'cerrada' && !editando.cliente_id) {
      showToast('Seleccioná o creá un cliente para esta reserva')
      return
    }
    if (!editando.propiedad_id) { showToast('Seleccioná una propiedad'); return }
    if (!editando.checkin || !editando.checkout) { showToast('Completá check-in y check-out'); return }
    if (editando.checkout <= editando.checkin) { showToast('El check-out debe ser posterior al check-in'); return }
    const aviso = editando.estado !== 'cerrada' && avisoCapacidad(propiedades.find(p => p.id === editando.propiedad_id), editando)
    if (aviso && !await confirmar(`${aviso} ¿Guardar igualmente como excepción?`)) return

    const reservasQuery = supabase
      .from('reservas')
      .select('id, checkin, checkout, estado, clientes(nombre, apellido)')
      .eq('propiedad_id', editando.propiedad_id)
      .neq('estado', 'cancelada')
      .lt('checkin', editando.checkout)
      .gt('checkout', editando.checkin)

    const [resReservas, resBloqueos] = await Promise.all([
      editando.id ? reservasQuery.neq('id', editando.id) : reservasQuery,
      supabase
        .from('bloqueos')
        .select('id, fecha_inicio, fecha_fin, motivo')
        .eq('propiedad_id', editando.propiedad_id)
        .lt('fecha_inicio', editando.checkout)
        .gt('fecha_fin', editando.checkin),
    ])

    if (resReservas.error) { showToast('Error verificando disponibilidad'); return }
    if (resBloqueos.error && resBloqueos.error.code !== '42P01') { showToast('Error verificando bloqueos manuales'); return }

    if ((resReservas.data ?? []).length > 0) {
      const c = resReservas.data[0]
      const nombreCliente = c.clientes?.nombre
        ? `${c.clientes.nombre} ${c.clientes.apellido || ''}`.trim()
        : 'otra reserva / fecha cerrada'
      showToast(`Sin disponibilidad: se superpone con ${nombreCliente}`)
      return
    }

    if ((resBloqueos.data ?? []).length > 0) {
      showToast('Sin disponibilidad: se superpone con noches cerradas manualmente')
      return
    }

    setGuardando(true)
    const { clientes, propiedades, created_at, noches, ...camposRaw } = editando
    const campos = {
      ...camposRaw,
      canal_origen: camposRaw.canal_origen === 'manual' ? 'directo' : camposRaw.canal_origen,
    }
    let error
    if (editando.id) {
      ({ error } = await supabase.from('reservas').update(campos).eq('id', editando.id))
    } else {
      ({ error } = await supabase.from('reservas').insert(campos))
    }
    setGuardando(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(editando.id ? '✓ Reserva actualizada' : '✓ Reserva creada')
    onSaved?.()
    setEditando(null)
    setDetalle(null)
    cargar()
  }

  async function eliminar(id) {
    if (!await confirmar('¿Eliminar esta reserva? Esta acción no se puede deshacer.')) return
    const { error } = await supabase.rpc('eliminar_reserva_segura', { p_reserva_id: id })
    if (error) {
      showToast(error.code === 'PGRST202' || error.code === '42883'
        ? 'Falta aplicar la migración 20260926_transacciones_seguras.sql. No se eliminó nada.'
        : `No se eliminó la reserva ni sus pagos: ${error.message}`)
      return
    }
    onDeleted?.()
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

  const ESTADOS = ['pendiente', 'confirmada', 'cerrada', 'finalizada']

  const COLORES_ESTADO = {
    pendiente:  { bg: '#F3E8FF', color: '#6B21A8' },
    confirmada: { bg: '#D1FAE5', color: '#065F46' },
    cerrada:    { bg: '#E5E7EB', color: '#4B5563' },
    finalizada: { bg: '#F3F4F6', color: '#374151' },
    // Soporte para colores viejos si existen en la BD todavía
    señada:     { bg: '#FEF3C7', color: '#92400E' },
    activa:     { bg: '#DBEAFE', color: '#1E40AF' },
    cancelada:  { bg: '#FEE2E2', color: '#991B1B' },
  }

  const ESTADO_LABELS = {
    pendiente: 'Pendiente',
    confirmada: 'Confirmada',
    cerrada: 'Cerrada / Bloqueada',
    finalizada: 'Finalizada',
    // Soporte para labels viejos
    señada: 'Seña',
    activa: 'Activa',
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
    canal_origen: 'directo',
  }

  if (editando) return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <h3 style={s.cardTitulo}>{editando.id ? 'Editar reserva' : 'Nueva reserva'}</h3>
        <button style={s.btnCancelar} onClick={() => onCancel ? onCancel() : setEditando(null)}>Cancelar</button>
      </div>

      <div style={s.grid2}>
        <Campo label="Cliente *" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              style={{ ...s.input, flex: 1 }}
              placeholder="Buscar por nombre o DNI..."
              value={busquedaCli}
              onChange={e => {
                setBusquedaCli(e.target.value)
                setMostrarDropdownCli(true)
                if (!e.target.value.trim()) {
                  setEditando(p => ({ ...p, cliente_id: '' }))
                }
              }}
              onFocus={() => setMostrarDropdownCli(true)}
            />
            <button
              type="button"
              style={{ ...s.btnSm, background: '#2d5a3d', color: '#fff', padding: '0 12px', whiteSpace: 'nowrap' }}
              onClick={() => {
                setNuevoCliData({
                  nombre: busquedaCli.trim() || '',
                  apellido: '', whatsapp: '', dni: '', email: '', ciudad: ''
                })
                setCreandoCliModal(true)
              }}
            >
              + Nuevo
            </button>
          </div>

          {mostrarDropdownCli && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              background: '#fff', border: '1px solid #ddd', borderRadius: 8,
              maxHeight: 200, overflowY: 'auto', zIndex: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}>
              {clientes.filter(c => {
                const q = busquedaCli.toLowerCase()
                return (
                  (c.nombre ?? '').toLowerCase().includes(q) ||
                  (c.apellido ?? '').toLowerCase().includes(q) ||
                  (c.dni ?? '').toLowerCase().includes(q)
                )
              }).slice(0, 8).map(c => (
                <div
                  key={c.id}
                  onClick={() => {
                    setEditando(p => ({ ...p, cliente_id: c.id }))
                    setBusquedaCli(`${c.nombre} ${c.apellido || ''}`)
                    setMostrarDropdownCli(false)
                  }}
                  style={{
                    padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                    borderBottom: '1px solid #f5f5f5',
                    background: editando.cliente_id === c.id ? '#e8f0eb' : '#fff'
                  }}
                >
                  <strong>{c.nombre} {c.apellido || ''}</strong> {c.dni ? `· DNI ${c.dni}` : ''}
                </div>
              ))}

              <div
                onClick={() => {
                  setNuevoCliData({
                    nombre: busquedaCli.trim() || '',
                    apellido: '', whatsapp: '', dni: '', email: '', ciudad: ''
                  })
                  setCreandoCliModal(true)
                  setMostrarDropdownCli(false)
                }}
                style={{
                  padding: '10px 12px', cursor: 'pointer', fontSize: 13,
                  fontWeight: 'bold', color: '#2d5a3d', background: '#f4fbf6',
                  borderTop: '1px solid #e0f0e5', textAlign: 'center'
                }}
              >
                + Crear cliente {busquedaCli.trim() ? `"${busquedaCli}"` : 'nuevo'}
              </div>
            </div>
          )}
        </Campo>
        <Campo label="Propiedad *">
          <select style={s.input} value={editando.propiedad_id ?? ''}
            onChange={e => setEditando(p => ({ ...p, propiedad_id: e.target.value }))}>
            <option value="">— Elegí —</option>
            {propiedades.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>
        <Campo label="Estado">
          <select style={s.input} value={editando.estado ?? 'pendiente'}
            onChange={e => setEditando(p => ({ ...p, estado: e.target.value }))}>
            {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
          </select>
        </Campo>
        <Campo label="Canal">
          <select style={s.input} value={editando.canal_origen === 'manual' ? 'directo' : editando.canal_origen ?? 'directo'}
            onChange={e => setEditando(p => ({ ...p, canal_origen: e.target.value }))}>
            <option value="directo">Manual / directo</option>
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
        {editando.estado !== 'cerrada' && avisoCapacidad(propiedades.find(p => p.id === editando.propiedad_id), editando) && <p role="alert" className="cobros-aviso">{avisoCapacidad(propiedades.find(p => p.id === editando.propiedad_id), editando)}</p>}
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
        <button style={s.btnCancelar} onClick={() => onCancel ? onCancel() : setEditando(null)}>Cancelar</button>
        <button style={s.btnPrimario} onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : '✓ Guardar'}
        </button>
      </div>

      {/* Modal de alta rápida de cliente dentro del formulario de reserva */}
      {creandoCliModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 450, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
            <h4 style={{ margin: '0 0 14px 0', fontSize: 16, fontWeight: 600, color: '#2d5a3d' }}>Alta rápida de cliente</h4>
            <form onSubmit={guardarNuevoClienteRapido} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#444' }}>Nombre *</label>
                <input
                  type="text" required style={s.input}
                  value={nuevoCliData.nombre}
                  onChange={e => setNuevoCliData(p => ({ ...p, nombre: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#444' }}>Apellido</label>
                <input
                  type="text" style={s.input}
                  value={nuevoCliData.apellido}
                  onChange={e => setNuevoCliData(p => ({ ...p, apellido: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#444' }}>WhatsApp / Teléfono</label>
                <input
                  type="text" style={s.input} placeholder="Ej: 1112345678"
                  value={nuevoCliData.whatsapp}
                  onChange={e => setNuevoCliData(p => ({ ...p, whatsapp: e.target.value }))}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#444' }}>DNI</label>
                  <input
                    type="text" style={s.input}
                    value={nuevoCliData.dni}
                    onChange={e => setNuevoCliData(p => ({ ...p, dni: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#444' }}>Ciudad</label>
                  <input
                    type="text" style={s.input}
                    value={nuevoCliData.ciudad}
                    onChange={e => setNuevoCliData(p => ({ ...p, ciudad: e.target.value }))}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button type="button" style={s.btnCancelar} onClick={() => setCreandoCliModal(false)}>
                  Cancelar
                </button>
                <button type="submit" style={s.btnPrimario} disabled={guardandoCliRapido}>
                  {guardandoCliRapido ? 'Guardando…' : '✓ Guardar y asignar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast msg={toast} />
    </div>
  )

  function fmt(str) {
    if (!str) return '—'
    const [y, m, d] = str.split('-')
    return `${d}/${m}/${y}`
  }

  const reservasFiltradas = lista
    .filter(r => {
      if (filtroProp !== 'todas' && r.propiedad_id !== filtroProp) return false
      if (filtroEstado === 'operativas') {
        return ['pendiente', 'confirmada', 'señada', 'activa'].includes(r.estado)
      }
      if (filtroEstado === 'cierres') return r.estado === 'cerrada'
      if (filtroEstado === 'cierres_manual') return esCierreManual(r)
      if (filtroEstado === 'cierres_booking') return r.estado === 'cerrada' && r.canal_origen === 'booking'
      if (filtroEstado === 'finalizadas') return r.estado === 'finalizada'
      if (filtroEstado !== 'todas' && r.estado !== filtroEstado) return false
      return true
    })
    .sort((a, b) => {
      if (ordenRes === 'checkin_asc') return (a.checkin || '').localeCompare(b.checkin || '')
      if (ordenRes === 'checkin_desc') return (b.checkin || '').localeCompare(a.checkin || '')
      if (ordenRes === 'created_desc') return (b.created_at || '').localeCompare(a.created_at || '')
      return 0
    })

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...s.input, width: 220 }} value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}>
          <option value="operativas">Pendientes y confirmadas</option>
          <option value="todas">Todos los estados</option>
          <option value="cierres">Solo cierres</option>
          <option value="cierres_manual">Solo cierres manuales</option>
          <option value="cierres_booking">Solo cierres Booking</option>
          <option value="finalizadas">Solo finalizadas</option>
          {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
        </select>
        <select style={{ ...s.input, width: 200 }} value={filtroProp}
          onChange={e => setFiltroProp(e.target.value)}>
          <option value="todas">Todas las propiedades</option>
          {propiedades.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select style={{ ...s.input, width: 220 }} value={ordenRes}
          onChange={e => setOrdenRes(e.target.value)}>
          <option value="checkin_asc">📅 Check-in: Próximas primero</option>
          <option value="checkin_desc">📅 Check-in: Más lejanas primero</option>
          <option value="created_desc">🕒 Fecha de creación</option>
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: '#888' }}>{reservasFiltradas.length} reserva(s)</span>
      </div>

      {loading ? <Cargando /> : (
        <div className="admin-lista">
          {reservasFiltradas.length === 0 && (
            <div style={s.empty}>
              {lista.length === 0 ? 'No hay reservas.' : 'No hay reservas con esos filtros.'}
            </div>
          )}
          {reservasFiltradas.length > 0 && <table className="admin-tabla admin-tabla-reservas">
            <caption className="admin-sr-only">Reservas ordenadas según el filtro seleccionado</caption>
            <thead><tr><th>Cliente</th><th>Ingreso</th><th>Egreso</th><th>Departamento</th><th>Estado</th><th>Precio total</th><th><span className="admin-sr-only">Acciones</span></th></tr></thead>
            <tbody>{reservasFiltradas.map(r => {
            const cierre = r.estado === 'cerrada'
            const faltantes = cierre || r.estado === 'cancelada' ? [] : [
              !r.cliente_id && 'Falta cliente',
              !(Number(r.precio_total) > 0) && 'Falta precio',
            ].filter(Boolean)
            return (
              <tr key={r.id} className={faltantes.length ? 'admin-fila-pendiente' : cierre || ['finalizada', 'cancelada'].includes(r.estado) ? 'admin-fila-inactiva' : ''}>
                <td className="admin-identidad"><Link to={`/reservas/${r.id}`}>{nombreReservaAdmin(r)}</Link>{faltantes.length > 0 && <small className="admin-faltantes">{faltantes.join(' · ')}</small>}</td>
                <td data-label="Ingreso">{fmt(r.checkin)}</td>
                <td data-label="Egreso">{fmt(r.checkout)}</td>
                <td data-label="Departamento">{r.propiedades?.nombre || 'Sin departamento'}</td>
                <td data-label="Estado">{cierre ? tipoCierreReserva(r) : (ESTADO_LABELS[r.estado] || r.estado)}</td>
                <td data-label="Precio total" className="admin-importe">{cierre ? '—' : Number(r.precio_total) > 0 ? `$${Number(r.precio_total).toLocaleString('es-AR')}` : 'Sin cargar'}</td>
                <td className="admin-acciones"><Link to={`/reservas/${r.id}?accion=editar`} aria-label={`Editar ${nombreReservaAdmin(r)}`}>Editar</Link></td>
              </tr>
            )
          })}</tbody></table>}
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
          onPago={(estado) => {
            if (estado) setDetalle(prev => ({ ...prev, estado }))
            cargar()
          }}
          onCambiarEstado={async (nuevoEstado) => {
            if (nuevoEstado === 'eliminar') {
              await eliminar(detalle.id)
              return
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

function ModalDetalleReserva({ reserva: r, propiedades, estados, estadoLabels, coloresEstado, onClose, onEditar, onCambiarEstado, onPago }) {
  const confirmar = useConfirmacion()
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
	            <div style={s.modalNombre}>{nombreReservaAdmin(r)}</div>
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
	            {r.estado === 'cerrada' && <DatoModal label="Tipo de cierre" value={tipoCierreReserva(r)} highlight />}
	            <DatoModal label="Canal" value={nombreCanal(r.canal_origen)} />
          </div>

          {r.notas_internas && (
            <div style={s.notasBox}>
              <span style={s.notasLabel}>Notas</span>
              {r.notas_internas}
            </div>
          )}

          <div style={s.estadosSection}>
            {r.estado !== 'cerrada' && <CobrosReserva key={`${r.id}-${r.estado}`} reserva={r} onChange={onPago} />}
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
            onClick={async () => {
              if (await confirmar('¿Eliminar esta reserva?')) {
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
  const cargaId = useRef(0)
  const confirmar = useConfirmacion()
  const [lista,    setLista]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [editando, setEditando] = useState(null)
  const [guardando,setGuardando]= useState(false)
  const [toast,    setToast]    = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtroRepetidor, setFiltroRepetidor] = useState('todos')
  const [ordenarPor, setOrdenarPor] = useState('nombre')
  const [historialReservas, setHistorialReservas] = useState([])

  // IA parser
  const [fichaTexto, setFichaTexto] = useState('')
  const [parseando, setParseando] = useState(false)
  const [parseStatus, setParseStatus] = useState(null)
  const [parseMsg, setParseMsg] = useState('')

  useEffect(() => {
    if (editando?.id) {
      supabase
        .from('reservas')
        .select('id, checkin, checkout, estado, propiedades(nombre)')
        .eq('cliente_id', editando.id)
        .order('checkin', { ascending: false })
        .then(({ data }) => setHistorialReservas(data ?? []))
    } else {
      setHistorialReservas([])
    }
  }, [editando])

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2200) }

  async function cargar(q = '') {
    const id = ++cargaId.current
    setLoading(true)
    let query = supabase.from('clientes').select('*').order('nombre')
    if (q.length >= 2) {
      query = query.or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,dni.ilike.%${q}%`)
    }
    const { data } = await query.limit(100)
    if (id !== cargaId.current) return
    setLista(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(() => cargar(busqueda), busqueda ? 300 : 0)
    return () => { clearTimeout(t); cargaId.current++ }
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
    if (!await confirmar('¿Eliminar este cliente? Esta acción no se puede deshacer.')) return
    const { error } = await supabase.from('clientes').delete().eq('id', id)
    if (error) { showToast('No se puede eliminar: tiene reservas asociadas'); return }
    showToast('Cliente eliminado')
    setEditando(null)
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
        <AdminTextField label="Patente vehículo" campo="vehiculo_patente" placeholder="AA123BB" editando={editando} setEditando={setEditando} />
        <Campo label="Opciones">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginTop: 8 }}>
            <input
              type="checkbox"
              checked={!!editando.es_repetidor}
              onChange={e => setEditando(p => ({ ...p, es_repetidor: e.target.checked }))}
            />
            ⭐ Cliente frecuente / Repetidor
          </label>
        </Campo>
      </div>
      <Campo label="Notas" style={{ marginTop: 12 }}>
        <textarea style={{ ...s.input, minHeight: 60, resize: 'vertical' }}
          value={editando.notas ?? ''}
          onChange={e => setEditando(p => ({ ...p, notas: e.target.value }))} />
      </Campo>

      {/* Historial de reservas asociadas */}
      {editando.id && (
        <div style={{ marginTop: 24, borderTop: '1px solid #eee', paddingTop: 16 }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            📅 Historial de reservas ({historialReservas.length})
          </h4>
          {historialReservas.length === 0 ? (
            <div style={{ fontSize: 12, color: '#999', italic: true }}>Este cliente no posee reservas registradas.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
              {historialReservas.map(r => {
                const fmtF = (str) => { if(!str) return ''; const [y,m,d] = str.split('-'); return `${d}/${m}/${y}` }
                return (
                  <div key={r.id} style={{
                    display: 'flex', justifyContent: 'space-between', padding: '6px 10px',
                    background: '#fcfcfc', border: '1px solid #eee', borderRadius: 6, fontSize: 12
                  }}>
                    <Link to={`/reservas/${r.id}`}>🏠 {r.propiedades?.nombre} · {fmtF(r.checkin)} → {fmtF(r.checkout)}</Link>
                    <span style={{
                      fontWeight: 600,
                      color: r.estado === 'confirmada' ? '#065F46' : r.estado === 'finalizada' ? '#374151' : '#6B21A8'
                    }}>{r.estado.toUpperCase()}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

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

  const listaProcesada = lista
    .filter(c => {
      if (filtroRepetidor === 'repetidores' && !c.es_repetidor) return false
      return true
    })
    .sort((a, b) => {
      if (ordenarPor === 'recientes') {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0)
      }
      const nombreA = `${a.nombre || ''} ${a.apellido || ''}`.toLowerCase()
      const nombreB = `${b.nombre || ''} ${b.apellido || ''}`.toLowerCase()
      return nombreA.localeCompare(nombreB)
    })

  return (
    <div>
      {/* Controles de búsqueda y filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...s.input, flex: 1, minWidth: 200 }} placeholder="Buscar por nombre, apellido o DNI…"
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        
        <select style={{ ...s.input, width: 150 }} value={filtroRepetidor} onChange={e => setFiltroRepetidor(e.target.value)}>
          <option value="todos">Todos los clientes</option>
          <option value="repetidores">⭐ Repetidores</option>
        </select>

        <select style={{ ...s.input, width: 150 }} value={ordenarPor} onChange={e => setOrdenarPor(e.target.value)}>
          <option value="nombre">Ordenar: A-Z</option>
          <option value="recientes">Ordenar: Recientes</option>
        </select>

        <button style={s.btnSm} onClick={exportarCSV}>⬇ CSV</button>
        <button style={s.btnPrimario} onClick={() => { setEditando({ ...vacio }); setFichaTexto(''); setParseStatus(null) }}>+ Nuevo</button>
      </div>

      {loading ? <Cargando /> : (
        <div className="admin-lista">
          {listaProcesada.length === 0 && <div style={s.empty}>No se encontraron clientes con estos filtros.</div>}
          {listaProcesada.length > 0 && <table className="admin-tabla admin-tabla-clientes">
            <caption className="admin-sr-only">Clientes</caption>
            <thead><tr><th>Cliente</th><th>WhatsApp</th><th>Correo electrónico</th><th>DNI</th></tr></thead>
            <tbody>{listaProcesada.map(c => {
              const sinContacto = !c.whatsapp?.trim() && !c.email?.trim()
              return <tr key={c.id} className={sinContacto ? 'admin-fila-pendiente' : ''}>
                <td className="admin-identidad"><button className="admin-nombre" onClick={() => setEditando({ ...c })} aria-label={`Ver ficha de ${c.nombre} ${c.apellido || ''}`} title={sinContacto ? 'Sin datos de contacto' : undefined}>{c.nombre} {c.apellido}</button>{c.es_repetidor && <small>Repetidor</small>}</td>
                <td data-label="WhatsApp">{c.whatsapp || '—'}</td>
                <td data-label="Correo" className="admin-correo">{c.email || '—'}</td>
                <td data-label="DNI">{c.dni || '—'}</td>
              </tr>
            })}</tbody>
          </table>}
        </div>
      )}
      <div style={{ padding: '8px 0', fontSize: 12, color: '#888', textAlign: 'right' }}>{listaProcesada.length} cliente(s) filtrado(s)</div>
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
  return <div className="admin-cargando" role="status">Cargando…</div>
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
  filaAcciones:{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },

  badge: { fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600 },
  empty: { padding: 32, textAlign: 'center', color: '#aaa', fontSize: 14 },

  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14 },

  input: {
    width: '100%', padding: '9px 12px', border: '1px solid #ddd',
    borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box', background: '#fafafa',
    appearance: 'none',
  },

  footerBtns:   { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0f0' },
  btnPrimario:  { padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--ui-primary)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
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
