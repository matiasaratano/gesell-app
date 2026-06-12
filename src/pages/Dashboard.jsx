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

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Dashboard() {
  const hoy = hoyStr()
  const [hora, setHora] = useState(fmtHora())

  const [alojadas,   setAlojadas]   = useState([])
  const [ingresan,   setIngresan]   = useState([])
  const [salen,      setSalen]      = useState([])
  const [clientes,   setClientes]   = useState([])
  const [solicitudes,setSolicitudes] = useState([])
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
      const [rProps, rAlojadas, rIngresan, rSalen, rClientes, rSolicitudes] = await Promise.all([

        // Propiedades activas
        supabase.from('propiedades').select('id, nombre').eq('activa', true).order('nombre'),

        // Reservas actualmente alojadas: checkin <= hoy < checkout, excluye canceladas
        supabase.from('reservas')
          .select('id, checkin, checkout, noches, adultos, precio_total, estado, canal_origen, clientes(nombre, apellido, whatsapp), propiedades(nombre)')
          .lte('checkin', hoy)
          .gt('checkout', hoy)
          .in('estado', ['activa', 'confirmada', 'señada', 'cerrada'])
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

        // Últimos clientes cargados
        supabase.from('clientes')
          .select('id, nombre, apellido, whatsapp, ciudad, created_at')
          .order('created_at', { ascending: false })
          .limit(5),

        // Últimas solicitudes (reservas en estado señada/pendiente recientes)
        supabase.from('reservas')
          .select('id, checkin, checkout, estado, canal_origen, created_at, clientes(nombre, apellido), propiedades(nombre)')
          .in('estado', ['señada', 'pendiente'])
          .order('created_at', { ascending: false })
          .limit(6),
      ])

      setPropiedades(rProps.data ?? [])
      setAlojadas(rAlojadas.data ?? [])
      setIngresan(rIngresan.data ?? [])
      setSalen(rSalen.data ?? [])
      setClientes(rClientes.data ?? [])
      setSolicitudes(rSolicitudes.data ?? [])
    } catch (e) {
      // silencioso — cada sección maneja su propio vacío
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.page}>

      {/* Header del día */}
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>Panel principal</h1>
          <div style={s.fecha}>{fmtDiaSemana()}</div>
        </div>
        <div style={s.reloj}>{hora}</div>
      </div>

      {loading ? (
        <div style={s.loadingPage}>Cargando…</div>
      ) : (
        <>
          {/* ── Fila 1: métricas rápidas ── */}
          <div style={s.metricasRow}>
            <MetricaCard
              valor={alojadas.length}
              label="Alojadas ahora"
              color="#2d5a3d"
              bg="#e8f0eb"
              icono="🏠"
            />
            <MetricaCard
              valor={ingresan.length}
              label="Ingresan hoy"
              color="#1E40AF"
              bg="#DBEAFE"
              icono="→"
            />
            <MetricaCard
              valor={salen.length}
              label="Salen hoy"
              color="#92400E"
              bg="#FEF3C7"
              icono="←"
            />
            <MetricaCard
              valor={propiedades.length}
              label="Propiedades activas"
              color="#374151"
              bg="#F3F4F6"
              icono="🔑"
            />
          </div>

          {/* ── Fila 2: alojadas + movimientos de hoy ── */}
          <div style={s.grid2}>

            {/* Alojadas ahora */}
            <Seccion titulo="Alojadas ahora" badge={alojadas.length} accion={{ label: 'Ver calendario', to: '/calendario' }}>
              {alojadas.length === 0 ? (
                <Vacio texto="No hay huéspedes alojados en este momento" />
              ) : (
                alojadas.map(r => (
                  <FilaReserva key={r.id} reserva={r} mostrarProp />
                ))
              )}
            </Seccion>

            {/* Check-ins y check-outs del día */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

          {/* ── Fila 3: clientes + solicitudes ── */}
          <div style={s.grid2}>

            {/* Últimas solicitudes pendientes */}
            <Seccion titulo="Solicitudes pendientes" badge={solicitudes.length} accion={{ label: 'Admin', to: '/admin' }}>
              {solicitudes.length === 0 ? (
                <Vacio texto="No hay reservas pendientes de confirmar" />
              ) : (
                solicitudes.map(r => (
                  <div key={r.id} style={s.filaSolicitud}>
                    <div style={s.filaSolicitudLeft}>
                      <div style={s.nombre}>
                        {CANAL_ICON[r.canal_origen] || '📋'}{' '}
                        {r.clientes?.nombre} {r.clientes?.apellido}
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
                  </div>
                ))
              )}
            </Seccion>

            {/* Últimos clientes */}
            <Seccion titulo="Últimos clientes" badge={clientes.length} accion={{ label: 'Ver todos', to: '/admin' }}>
              {clientes.length === 0 ? (
                <Vacio texto="No hay clientes registrados aún" />
              ) : (
                clientes.map(c => (
                  <div key={c.id} style={s.filaCliente}>
                    <div style={s.clienteAvatar}>
                      {(c.nombre?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div style={s.filaClienteInfo}>
                      <div style={s.nombre}>{c.nombre} {c.apellido}</div>
                      <div style={s.sub}>
                        {c.ciudad || 'Sin ciudad'}{c.whatsapp ? ` · ${c.whatsapp}` : ''}
                      </div>
                    </div>
                    {c.whatsapp && (
                      <a
                        href={`https://wa.me/${c.whatsapp.replace(/\D/g,'')}`}
                        target="_blank"
                        rel="noreferrer"
                        style={s.btnWA}
                      >
                        WA
                      </a>
                    )}
                  </div>
                ))
              )}
            </Seccion>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function MetricaCard({ valor, label, color, bg, icono }) {
  return (
    <div style={{ ...s.metricaCard, background: bg }}>
      <div style={{ ...s.metricaIcono, color }}>{icono}</div>
      <div style={{ ...s.metricaValor, color }}>{valor}</div>
      <div style={{ ...s.metricaLabel, color }}>{label}</div>
    </div>
  )
}

function Seccion({ titulo, badge, accion, children }) {
  return (
    <div style={s.card}>
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
  const waLink = r.clientes?.whatsapp
    ? `https://wa.me/${r.clientes.whatsapp.replace(/\D/g, '')}`
    : null

  return (
    <div style={s.filaReserva}>
      <div style={s.filaReservaLeft}>
        <div style={s.nombre}>
          {r.clientes?.nombre} {r.clientes?.apellido}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          ...s.estadoBadge,
          background: ESTADO_STYLE[r.estado]?.bg ?? '#f0f0f0',
          color:      ESTADO_STYLE[r.estado]?.color ?? '#333',
        }}>
          {r.estado}
        </span>
        {waLink && (
          <a href={waLink} target="_blank" rel="noreferrer" style={s.btnWA}>WA</a>
        )}
      </div>
    </div>
  )
}

function Vacio({ texto }) {
  return (
    <div style={s.vacio}>{texto}</div>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = {
  page: {
    maxWidth: 1100, margin: '0 auto', padding: '28px 20px 60px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },

  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 28,
  },
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: '#1a1814', margin: 0 },
  fecha: { fontSize: 13, color: '#888', marginTop: 4 },
  reloj: { fontSize: 28, fontWeight: 300, color: '#2d5a3d', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' },

  loadingPage: { padding: 60, textAlign: 'center', color: '#aaa', fontSize: 14 },

  // Métricas
  metricasRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 },
  metricaCard: { borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4 },
  metricaIcono: { fontSize: 20, lineHeight: 1 },
  metricaValor: { fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1 },
  metricaLabel: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.8 },

  // Grilla
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },

  // Cards
  card: {
    background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12,
    overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
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
  filaReservaLeft: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 },

  // Fila solicitud
  filaSolicitud: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 18px', borderBottom: '1px solid #f8f8f8', gap: 12,
  },
  filaSolicitudLeft: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },

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