import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Utilidades de fecha ──────────────────────────────────────────────────────
function padZ(n) { return String(n).padStart(2, '0') }
function hoyStr() {
  const d = new Date()
  return `${d.getFullYear()}-${padZ(d.getMonth() + 1)}-${padZ(d.getDate())}`
}
function fmtFecha(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}
function fmtHora() {
  const d = new Date()
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}
function fmtDiaSemana() {
  const d = new Date()
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`
}
function calcNoches(checkin, checkout) {
  if (!checkin || !checkout) return 0
  const [y1,m1,d1] = checkin.split('-').map(Number)
  const [y2,m2,d2] = checkout.split('-').map(Number)
  return Math.max(0, Math.round((new Date(y2,m2-1,d2) - new Date(y1,m1-1,d1)) / 86400000))
}

function diasHasta(fecha) {
  const hoy = hoyStr()
  const [y1,m1,d1] = hoy.split('-').map(Number)
  const [y2,m2,d2] = fecha.split('-').map(Number)
  return Math.round((new Date(y2,m2-1,d2) - new Date(y1,m1-1,d1)) / 86400000)
}

function reservaNombre(r) {
  const nombre = `${r.clientes?.nombre || ''} ${r.clientes?.apellido || ''}`.trim()
  if (nombre) return nombre
  if (r.notas_internas) return r.notas_internas
  return r.canal_origen === 'booking' ? 'Reserva de Booking' : 'Reserva sin cliente'
}

function nombreCanal(canal) {
  if (canal === 'booking') return 'Booking'
  if (canal === 'airbnb') return 'Airbnb'
  if (canal === 'directo' || canal === 'manual') return 'Manual'
  return canal ? canal.charAt(0).toUpperCase() + canal.slice(1) : 'Manual'
}

function tipoCierreReserva(r) {
  return `Cierre ${nombreCanal(r?.canal_origen)}`
}

function buildTareas(reservas = []) {
  return reservas.flatMap((r) => {
    const tareas = []
    const prop = r.propiedades?.nombre || 'Propiedad sin nombre'
    const fechas = `${prop} · ${fmtFecha(r.checkin)} → ${fmtFecha(r.checkout)}`
    const canal = r.canal_origen ? r.canal_origen.charAt(0).toUpperCase() + r.canal_origen.slice(1) : 'Manual'
    const precio = Number(r.precio_total || 0)
    const esBooking = r.canal_origen === 'booking'

    if (!r.cliente_id) {
      tareas.push({
        id: `${r.id}-cliente`,
        reservaId: r.id,
        tipo: r.canal_origen === 'booking' ? 'Booking sin cliente' : 'Falta cliente',
        titulo: reservaNombre(r),
        detalle: fechas,
        color: '#92400E',
        bg: '#FEF3C7',
      })
    }

    if (!precio) {
      tareas.push({
        id: `${r.id}-precio`,
        reservaId: r.id,
        tipo: 'Falta precio',
        titulo: reservaNombre(r),
        detalle: `${fechas} · ${canal}`,
        color: '#1E40AF',
        bg: '#DBEAFE',
      })
    }

    if (r.estado === 'pendiente') {
      tareas.push({
        id: `${r.id}-confirmar`,
        reservaId: r.id,
        tipo: 'Confirmar seña',
        titulo: reservaNombre(r),
        detalle: esBooking
          ? `${fechas} · si paga por fuera, pasar a confirmada`
          : `${fechas} · pasar a confirmada cuando pague`,
        color: '#6B21A8',
        bg: '#F3E8FF',
      })
    }

    if (r.estado === 'pendiente' && esBooking && diasHasta(r.checkin) <= 45) {
      tareas.push({
        id: `${r.id}-contactar-booking`,
        reservaId: r.id,
        tipo: 'Contactar Booking',
        titulo: reservaNombre(r),
        detalle: `${fechas} · confirmar si sigue en pie`,
        color: '#0F4D90',
        bg: '#DBEAFE',
      })
    }

    return tareas
  }).slice(0, 12)
}

// ─── Colores de estado ────────────────────────────────────────────────────────
const ESTADO_STYLE = {
  señada:     { bg: '#FEF3C7', color: '#92400E' },
  pendiente:  { bg: '#F3E8FF', color: '#6B21A8' },
  confirmada: { bg: '#D1FAE5', color: '#065F46' },
  activa:     { bg: '#DBEAFE', color: '#1E40AF' },
  finalizada: { bg: '#F3F4F6', color: '#374151' },
  cerrada:    { bg: '#E5E7EB', color: '#4B5563' },
  cancelada:  { bg: '#FEE2E2', color: '#991B1B' },
}

const CANAL_ICON = {
  whatsapp: '📲',
  mail:     '✉️',
  telefono: '📞',
  booking:  '🏨',
  airbnb:   '🏠',
  directo:  '🤝',
}

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])

  return isMobile
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Dashboard() {
  const isMobile = useIsMobile()
  const [hora, setHora] = useState(fmtHora())

  const [alojadas,   setAlojadas]   = useState([])
  const [ingresan,   setIngresan]   = useState([])
  const [salen,      setSalen]      = useState([])
  const [solicitudes,setSolicitudes] = useState([])
  const [tareas,     setTareas]     = useState([])
  const [propiedades,setPropiedades] = useState([])
  const [loading,    setLoading]    = useState(true)

  // Reloj en tiempo real
  useEffect(() => {
    const t = setInterval(() => setHora(fmtHora()), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    try {
      const hoy = hoyStr()

      // Automatización: Finalizar reservas cuya fecha de checkout ya pasó
      // (excluye 'cerrada' para no tocar bloqueos de plataforma)
      await supabase
        .from('reservas')
        .update({ estado: 'finalizada' })
        .lt('checkout', hoy)
        .not('estado', 'in', '("finalizada","cancelada","cerrada")')

      const [rProps, rAlojadas, rIngresan, rSalen, rSolicitudes, rTareas] = await Promise.all([

        // Propiedades activas
        supabase.from('propiedades').select('id, nombre').eq('activa', true).order('nombre'),

        // Reservas actualmente alojadas: checkin <= hoy < checkout, excluye canceladas
        supabase.from('reservas')
          .select('id, checkin, checkout, noches, adultos, precio_total, estado, canal_origen, clientes(nombre, apellido, whatsapp), propiedades(nombre)')
          .lte('checkin', hoy)
          .gt('checkout', hoy)
          .in('estado', ['confirmada', 'pendiente', 'activa', 'señada', 'cerrada'])
          .order('checkout'),

        // Ingresan hoy (excluye canceladas y bloqueos de plataforma)
        supabase.from('reservas')
          .select('id, checkin, checkout, noches, adultos, precio_total, estado, canal_origen, clientes(nombre, apellido, whatsapp), propiedades(nombre)')
          .eq('checkin', hoy)
          .not('estado', 'in', '("cancelada","cerrada")')
          .order('propiedades(nombre)'),

        // Salen hoy (excluye canceladas y bloqueos de plataforma)
        supabase.from('reservas')
          .select('id, checkin, checkout, noches, adultos, precio_total, estado, canal_origen, clientes(nombre, apellido, whatsapp), propiedades(nombre)')
          .eq('checkout', hoy)
          .not('estado', 'in', '("cancelada","cerrada")')
          .order('propiedades(nombre)'),

        // Últimas solicitudes (pendientes o reservas de canales sin cliente)
        supabase.from('reservas')
          .select('id, checkin, checkout, estado, canal_origen, created_at, clientes(nombre, apellido), propiedades(nombre)')
          .in('estado', ['señada', 'pendiente'])
          .order('checkin', { ascending: true })
          .limit(10),

        // Tareas operativas sobre reservas actuales/futuras
        supabase.from('reservas')
          .select('id, cliente_id, checkin, checkout, precio_total, estado, canal_origen, notas_internas, clientes(nombre, apellido), propiedades(nombre)')
          .gte('checkout', hoy)
          .not('estado', 'in', '("cancelada","cerrada","finalizada")')
          .order('checkin', { ascending: true })
          .limit(80),
      ])

      setPropiedades(rProps.data ?? [])
      setAlojadas(rAlojadas.data ?? [])
      setIngresan(rIngresan.data ?? [])
      setSalen(rSalen.data ?? [])
      setSolicitudes(rSolicitudes.data ?? [])
      setTareas(buildTareas(rTareas.data ?? []))
    } catch (e) {
      // silencioso — cada sección maneja su propio vacío
    } finally {
      setLoading(false)
    }
  }

  const alojadasReales = alojadas.filter(r => r.estado !== 'cerrada')
  const cerradasAhora = alojadas.filter(r => r.estado === 'cerrada')

  return (
    <div style={{ ...s.page, ...(isMobile ? s.pageMobile : {}) }}>

      {/* Header del día */}
      <div style={{ ...s.header, ...(isMobile ? s.headerMobile : {}) }}>
        <div>
          <h1 style={{ ...s.h1, ...(isMobile ? s.h1Mobile : {}) }}>Panel principal</h1>
          <div style={s.fecha}>{fmtDiaSemana()}</div>
        </div>
        <div style={{ ...s.reloj, ...(isMobile ? s.relojMobile : {}) }}>{hora}</div>
      </div>

      {loading ? (
        <div style={s.loadingPage}>Cargando…</div>
      ) : (
        <>
          {/* ── Fila 1: métricas rápidas ── */}
          <div style={{ ...s.metricasRow, ...(isMobile ? s.metricasRowMobile : {}) }}>
            <MetricaCard
              valor={alojadasReales.length}
              label="Alojadas ahora"
              color="#2d5a3d"
              bg="#e8f0eb"
              icono="🏠"
              compact={isMobile}
            />
            <MetricaCard
              valor={cerradasAhora.length}
              label="Cerradas ahora"
              color="#4B5563"
              bg="#E5E7EB"
              icono="🔒"
              compact={isMobile}
            />
            <MetricaCard
              valor={ingresan.length}
              label="Ingresan hoy"
              color="#1E40AF"
              bg="#DBEAFE"
              icono="→"
              compact={isMobile}
            />
            <MetricaCard
              valor={salen.length}
              label="Salen hoy"
              color="#92400E"
              bg="#FEF3C7"
              icono="←"
              compact={isMobile}
            />
            <MetricaCard
              valor={solicitudes.length}
              label="Pendientes"
              color="#6B21A8"
              bg="#F3E8FF"
              icono="📋"
              compact={isMobile}
            />
          </div>

          <Seccion titulo="Tareas para ordenar" badge={tareas.length} style={s.tareasCard}>
            {tareas.length === 0 ? (
              <Vacio texto="No hay reservas futuras con datos pendientes" />
            ) : (
              tareas.map(t => <FilaTarea key={t.id} tarea={t} compact={isMobile} />)
            )}
          </Seccion>

          {/* ── Grilla de 2 columnas de reservas ── */}
          <div style={{ ...s.grid2, ...(isMobile ? s.grid2Mobile : {}) }}>
            {/* Columna Izquierda: Alojadas ahora + Solicitudes pendientes */}
            <div style={s.columnStack}>
              <Seccion titulo="Alojadas ahora" badge={alojadasReales.length} accion={{ label: 'Ver calendario', to: '/calendario' }}>
                {alojadas.length === 0 ? (
                  <Vacio texto="No hay huéspedes alojados ni noches cerradas en este momento" />
                ) : (
                  alojadas.map(r => (
                    <FilaReserva key={r.id} reserva={r} mostrarProp />
                  ))
                )}
              </Seccion>

              <Seccion titulo="Solicitudes pendientes" badge={solicitudes.length} accion={{ label: 'Admin', to: '/admin?seccion=reservas' }}>
                {solicitudes.length === 0 ? (
                  <Vacio texto="No hay reservas pendientes de confirmar" />
                ) : (
                  solicitudes.map(r => (
                    <Link
                      key={r.id}
                      to={`/admin?seccion=reservas&reserva_id=${r.id}`}
                      style={s.filaSolicitudLink}
                      className="fila-clickeable"
                    >
                      <div style={s.filaSolicitudLeft}>
                        <div style={s.nombre}>
                          {CANAL_ICON[r.canal_origen] || '📋'}{' '}
                          {r.clientes?.nombre
                            ? `${r.clientes.nombre} ${r.clientes.apellido || ''}`
                            : <span style={{ color: '#D97706', fontStyle: 'italic' }}>Sin cliente — asignar</span>
                          }
                        </div>
                        <div style={s.sub}>
                          {r.propiedades?.nombre} · {fmtFecha(r.checkin)} → {fmtFecha(r.checkout)}
                        </div>
                      </div>
                      <span style={{
                        ...s.estadoBadge,
                        background: ESTADO_STYLE[r.estado]?.bg ?? '#f0f0f0',
                        color:      ESTADO_STYLE[r.estado]?.color ?? '#333',
                      }}>
                        {r.estado}
                      </span>
                    </Link>
                  ))
                )}
              </Seccion>
            </div>

            {/* Columna Derecha: Ingresan hoy + Salen hoy */}
            <div style={s.columnStack}>
              <Seccion titulo="Ingresan hoy" badge={ingresan.length} accion={{ label: '+ Nueva', to: '/nueva' }}>
                {ingresan.length === 0 ? (
                  <Vacio texto="Sin ingresos programados hoy" />
                ) : (
                  ingresan.map(r => <FilaReserva key={r.id} reserva={r} mostrarProp />)
                )}
              </Seccion>

              <Seccion titulo="Salen hoy" badge={salen.length}>
                {salen.length === 0 ? (
                  <Vacio texto="Sin salidas programadas hoy" />
                ) : (
                  salen.map(r => <FilaReserva key={r.id} reserva={r} mostrarProp />)
                )}
              </Seccion>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function MetricaCard({ valor, label, color, bg, icono, compact = false }) {
  return (
    <div style={{ ...s.metricaCard, ...(compact ? s.metricaCardMobile : {}), background: bg }}>
      <div style={{ ...s.metricaIcono, color }}>{icono}</div>
      <div style={{ ...s.metricaValor, ...(compact ? s.metricaValorMobile : {}), color }}>{valor}</div>
      <div style={{ ...s.metricaLabel, ...(compact ? s.metricaLabelMobile : {}), color }}>{label}</div>
    </div>
  )
}

function Seccion({ titulo, badge, accion, children, style }) {
  return (
    <div style={{ ...s.card, ...style }}>
      <div style={s.cardHeader}>
        <div style={s.cardTituloRow}>
          <span style={s.cardTitulo}>{titulo}</span>
          {badge > 0 && <span style={s.badge}>{badge}</span>}
        </div>
        {accion && (
          <Link to={accion.to} style={s.cardAccion}>{accion.label} →</Link>
        )}
      </div>
      <div style={s.cardBody}>{children}</div>
    </div>
  )
}

function FilaReserva({ reserva: r, mostrarProp }) {
  const noches = r.noches ?? calcNoches(r.checkin, r.checkout)
  const esCerrada = r.estado === 'cerrada'
  const nombreCliente = `${r.clientes?.nombre || ''} ${r.clientes?.apellido || ''}`.trim()
  const titulo = nombreCliente || (esCerrada ? tipoCierreReserva(r) : 'Sin cliente')
  const waLink = r.clientes?.whatsapp
    ? `https://wa.me/${r.clientes.whatsapp.replace(/\D/g, '')}`
    : null

  return (
    <Link 
      to={`/admin?seccion=reservas&reserva_id=${r.id}`} 
      style={s.filaReservaLink}
      className="fila-clickeable"
    >
      <div style={s.filaReservaLeft}>
        <div style={s.nombre}>
          {titulo}
        </div>
        <div style={s.sub}>
          {mostrarProp && r.propiedades?.nombre && (
            <span>{r.propiedades.nombre} · </span>
          )}
          {fmtFecha(r.checkin)} → {fmtFecha(r.checkout)}
          {noches > 0 && ` · ${noches}n`}
          {r.precio_total ? ` · $${Number(r.precio_total).toLocaleString('es-AR')}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
        <span style={{
          ...s.estadoBadge,
          background: ESTADO_STYLE[r.estado]?.bg ?? '#f0f0f0',
          color:      ESTADO_STYLE[r.estado]?.color ?? '#333',
        }}>
          {esCerrada ? nombreCanal(r.canal_origen) : r.estado}
        </span>
        {waLink && (
          <a href={waLink} target="_blank" rel="noreferrer" style={s.btnWA} onClick={e => e.stopPropagation()}>WA</a>
        )}
      </div>
    </Link>
  )
}

function Vacio({ texto }) {
  return (
    <div style={s.vacio}>{texto}</div>
  )
}

function FilaTarea({ tarea: t, compact = false }) {
  return (
    <Link
      to={`/admin?seccion=reservas&reserva_id=${t.reservaId}`}
      style={{ ...s.filaTareaLink, ...(compact ? s.filaTareaLinkMobile : {}) }}
      className="fila-clickeable"
    >
      <span style={{ ...s.tareaTipo, ...(compact ? s.tareaTipoMobile : {}), background: t.bg, color: t.color }}>
        {t.tipo}
      </span>
      <div style={s.filaTareaInfo}>
        <div style={s.nombre}>{t.titulo}</div>
        <div style={s.sub}>{t.detalle}</div>
      </div>
      <span style={s.tareaArrow}>→</span>
    </Link>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = {
  page: {
    maxWidth: 1100, margin: '0 auto', padding: '28px 20px 60px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  pageMobile: {
    padding: '16px 10px 48px',
  },

  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 28,
  },
  headerMobile: {
    marginBottom: 18,
    gap: 10,
  },
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: '#1a1814', margin: 0 },
  h1Mobile: { fontSize: 21 },
  fecha: { fontSize: 13, color: '#888', marginTop: 4 },
  reloj: { fontSize: 28, fontWeight: 300, color: '#2d5a3d', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' },
  relojMobile: { fontSize: 22 },

  loadingPage: { padding: 60, textAlign: 'center', color: '#aaa', fontSize: 14 },

  // Métricas
  metricasRow: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 },
  metricasRowMobile: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 12 },
  metricaCard: { borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4 },
  metricaCardMobile: { padding: '12px 12px', minHeight: 92 },
  metricaIcono: { fontSize: 20, lineHeight: 1 },
  metricaValor: { fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1 },
  metricaValorMobile: { fontSize: 28 },
  metricaLabel: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.8 },
  metricaLabelMobile: { fontSize: 10, lineHeight: 1.2 },

  // Grilla
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16, minWidth: 0 },
  grid2Mobile: { gridTemplateColumns: '1fr', gap: 12 },
  columnStack: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 },

  // Cards
  card: {
    background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12,
    overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    width: '100%', minWidth: 0,
  },
  tareasCard: { marginBottom: 16 },
  cardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 18px', borderBottom: '1px solid #f0f0f0',
  },
  cardTituloRow: { display: 'flex', alignItems: 'center', gap: 8 },
  cardTitulo: { fontSize: 13, fontWeight: 600, color: '#1a1814', textTransform: 'uppercase', letterSpacing: '0.06em' },
  badge: { background: '#2d5a3d', color: '#fff', borderRadius: 99, fontSize: 11, fontWeight: 700, padding: '1px 8px', minWidth: 20, textAlign: 'center' },
  cardAccion: { fontSize: 12, color: '#2d5a3d', textDecoration: 'none', fontWeight: 500 },
  cardBody: { padding: '4px 0' },

  // Filas de reserva
  filaReserva: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 18px', borderBottom: '1px solid #f8f8f8',
  },
  filaReservaLink: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 18px', borderBottom: '1px solid #f8f8f8',
    textDecoration: 'none', color: 'inherit',
  },
  filaReservaLeft: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 },

  // Fila solicitud
  filaSolicitud: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 18px', borderBottom: '1px solid #f8f8f8', gap: 12,
  },
  filaSolicitudLink: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 18px', borderBottom: '1px solid #f8f8f8', gap: 12,
    textDecoration: 'none', color: 'inherit',
  },
  filaSolicitudLeft: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },

  // Tareas
  filaTareaLink: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 18px', borderBottom: '1px solid #f8f8f8',
    textDecoration: 'none', color: 'inherit',
  },
  filaTareaLinkMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
    padding: '12px',
  },
  tareaTipo: {
    fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 700,
    flexShrink: 0, minWidth: 104, textAlign: 'center',
  },
  tareaTipoMobile: { minWidth: 0, fontSize: 10, padding: '3px 7px' },
  filaTareaInfo: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 },
  tareaArrow: { color: '#aaa', fontSize: 14, flexShrink: 0 },

  // Fila cliente
  filaCliente: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 18px', borderBottom: '1px solid #f8f8f8',
  },
  clienteAvatar: {
    width: 34, height: 34, borderRadius: '50%', background: '#e8f0eb',
    color: '#2d5a3d', fontWeight: 700, fontSize: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  filaClienteInfo: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 },

  // Texto común
  nombre: { fontSize: 14, fontWeight: 600, color: '#1a1814', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  sub:    { fontSize: 12, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },

  estadoBadge: { fontSize: 11, padding: '2px 9px', borderRadius: 99, fontWeight: 600, flexShrink: 0 },

  btnWA: {
    padding: '4px 10px', borderRadius: 6, background: '#25D366', color: '#fff',
    textDecoration: 'none', fontSize: 11, fontWeight: 600, flexShrink: 0,
  },

  vacio: { padding: '20px 18px', fontSize: 13, color: '#bbb', textAlign: 'center' },
}
