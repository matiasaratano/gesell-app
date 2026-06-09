import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ─── Utilidades ───────────────────────────────────────────────────────────────
function padZ(n) { return String(n).padStart(2, '0') }

function primerDiaMes(year, month1) {
  return `${year}-${padZ(month1)}-01`
}

function ultimoDiaMes(year, month1) {
  const d = new Date(year, month1, 0)
  return `${year}-${padZ(month1)}-${padZ(d.getDate())}`
}

function diasEnMes(year, month1) {
  return new Date(year, month1, 0).getDate()
}

function fmtPesos(n) {
  if (!n) return '$0'
  return '$' + Number(n).toLocaleString('es-AR')
}

function fmtFecha(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const ESTADO_STYLE = {
  señada:     { bg: '#FEF3C7', color: '#92400E' },
  pendiente:  { bg: '#F3E8FF', color: '#6B21A8' },
  confirmada: { bg: '#D1FAE5', color: '#065F46' },
  activa:     { bg: '#DBEAFE', color: '#1E40AF' },
  finalizada: { bg: '#F3F4F6', color: '#374151' },
  cerrada:    { bg: '#E5E7EB', color: '#4B5563' },
  cancelada:  { bg: '#FEE2E2', color: '#991B1B' },
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Reportes() {
  const hoy = new Date()

  // Filtros
  const [year,    setYear]    = useState(hoy.getFullYear())
  const [month,   setMonth]   = useState(hoy.getMonth() + 1) // 1-indexed
  const [propId,  setPropId]  = useState('todas')
  const [modo,    setModo]    = useState('mes') // 'mes' | 'custom'
  const [desde,   setDesde]   = useState(primerDiaMes(hoy.getFullYear(), hoy.getMonth() + 1))
  const [hasta,   setHasta]   = useState(ultimoDiaMes(hoy.getFullYear(), hoy.getMonth() + 1))

  // Datos
  const [propiedades, setPropiedades] = useState([])
  const [reservas,    setReservas]    = useState([])
  const [loading,     setLoading]     = useState(true)

  // Cargar propiedades una sola vez
  useEffect(() => {
    supabase.from('propiedades').select('id, nombre').eq('activa', true).order('nombre')
      .then(({ data }) => setPropiedades(data ?? []))
  }, [])

  // Sincronizar fechas cuando cambia año/mes en modo 'mes'
  useEffect(() => {
    if (modo === 'mes') {
      setDesde(primerDiaMes(year, month))
      setHasta(ultimoDiaMes(year, month))
    }
  }, [year, month, modo])

  // Cargar reservas cuando cambian filtros
  useEffect(() => {
    if (!desde || !hasta) return
    cargar()
  }, [desde, hasta, propId])

  async function cargar() {
    setLoading(true)
    let q = supabase
      .from('reservas')
      .select('id, propiedad_id, checkin, checkout, noches, precio_total, estado, canal_origen, clientes(nombre, apellido), propiedades(nombre)')
      .lte('checkin', hasta)
      .gt('checkout', desde)
      .order('checkin')

    if (propId !== 'todas') q = q.eq('propiedad_id', propId)

    const { data } = await q
    setReservas(data ?? [])
    setLoading(false)
  }

  function navMes(dir) {
    let m = month + dir
    let y = year
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setMonth(m)
    setYear(y)
  }

  // ── Métricas calculadas ───────────────────────────────────────────────────
  const reales = reservas.filter(r => r.estado !== 'cerrada' && r.estado !== 'cancelada')
  const confirmadas = reservas.filter(r => ['confirmada','activa','finalizada','señada','pendiente'].includes(r.estado))

  // Días del período
  const [y1,m1,d1] = desde.split('-').map(Number)
  const [y2,m2,d2] = hasta.split('-').map(Number)
  const diasPeriodo = Math.max(1, Math.round((new Date(y2,m2-1,d2) - new Date(y1,m1-1,d1)) / 86400000) + 1)

  // Propiedades en el filtro
  const cantProps = propId === 'todas' ? propiedades.length : 1
  const diasDisponibles = diasPeriodo * cantProps

  // Noches ocupadas (clamp al rango del período)
  const nochesOcupadas = reales.reduce((acc, r) => {
    const ci = r.checkin > desde ? r.checkin : desde
    const co = r.checkout < hasta ? r.checkout : hasta
    const [ya,ma,da] = ci.split('-').map(Number)
    const [yb,mb,db] = co.split('-').map(Number)
    const n = Math.max(0, Math.round((new Date(yb,mb-1,db) - new Date(ya,ma-1,da)) / 86400000))
    return acc + n
  }, 0)

  const ocupacion = diasDisponibles > 0 ? Math.round((nochesOcupadas / diasDisponibles) * 100) : 0

  const totalIngresos  = reales.reduce((acc, r) => acc + (r.precio_total ?? 0), 0)
  const totalNoches    = reales.reduce((acc, r) => acc + (r.noches ?? 0), 0)
  const ticketPromedio = reales.length > 0 ? Math.round(totalIngresos / reales.length) : 0
  const nocheProm      = reales.length > 0 && totalNoches > 0
    ? Math.round(totalIngresos / totalNoches) : 0

  const pendientes = reservas.filter(r => r.estado === 'señada' || r.estado === 'pendiente')
  const canceladas = reservas.filter(r => r.estado === 'cancelada')

  // Por propiedad
  const porProp = propiedades.map(p => {
    const rs = reales.filter(r => r.propiedad_id === p.id)
    const ing = rs.reduce((a, r) => a + (r.precio_total ?? 0), 0)
    const noches = rs.reduce((a, r) => a + (r.noches ?? 0), 0)
    const ocp = diasPeriodo > 0 ? Math.round((noches / diasPeriodo) * 100) : 0
    return { ...p, reservas: rs.length, ingresos: ing, noches, ocupacion: ocp }
  }).filter(p => p.reservas > 0 || propId === 'todas')

  // Por canal
  const canales = {}
  reales.forEach(r => {
    const c = r.canal_origen || 'directo'
    if (!canales[c]) canales[c] = { count: 0, ingresos: 0 }
    canales[c].count++
    canales[c].ingresos += r.precio_total ?? 0
  })

  const periodoLabel = modo === 'mes'
    ? `${MESES[month - 1]} ${year}`
    : `${fmtFecha(desde)} — ${fmtFecha(hasta)}`

  return (
    <div style={s.page}>

      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>Reportes</h1>
          <div style={s.sub}>{periodoLabel} · {propId === 'todas' ? 'Todas las propiedades' : propiedades.find(p => p.id === propId)?.nombre}</div>
        </div>
        {loading && <span style={s.loadingBadge}>Actualizando…</span>}
      </div>

      {/* Filtros */}
      <div style={s.filtrosCard}>
        <div style={s.filtrosRow}>

          {/* Modo período */}
          <div style={s.modoTabs}>
            <button style={{ ...s.modoTab, ...(modo === 'mes' ? s.modoTabActive : {}) }} onClick={() => setModo('mes')}>Por mes</button>
            <button style={{ ...s.modoTab, ...(modo === 'custom' ? s.modoTabActive : {}) }} onClick={() => setModo('custom')}>Rango libre</button>
          </div>

          {/* Selector mes */}
          {modo === 'mes' && (
            <div style={s.navMes}>
              <button style={s.navBtn} onClick={() => navMes(-1)}>‹</button>
              <span style={s.mesLabel}>{MESES[month - 1]} {year}</span>
              <button style={s.navBtn} onClick={() => navMes(1)}>›</button>
            </div>
          )}

          {/* Rango libre */}
          {modo === 'custom' && (
            <div style={s.rangoRow}>
              <div style={s.rangoField}>
                <label style={s.rangoLabel}>Desde</label>
                <input type="date" style={s.input} value={desde} onChange={e => setDesde(e.target.value)} />
              </div>
              <div style={s.rangoField}>
                <label style={s.rangoLabel}>Hasta</label>
                <input type="date" style={s.input} value={hasta} onChange={e => setHasta(e.target.value)} />
              </div>
            </div>
          )}

          {/* Propiedad */}
          <div style={s.rangoField}>
            <label style={s.rangoLabel}>Propiedad</label>
            <select style={s.input} value={propId} onChange={e => setPropId(e.target.value)}>
              <option value="todas">Todas</option>
              {propiedades.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Métricas principales ── */}
      <div style={s.metricasGrid}>
        <Metrica label="Reservas" valor={reales.length} sub={`${canceladas.length} canceladas`} color="#2d5a3d" bg="#e8f0eb" />
        <Metrica label="Ocupación" valor={`${ocupacion}%`} sub={`${nochesOcupadas} de ${diasDisponibles} noches`} color="#1E40AF" bg="#DBEAFE" />
        <Metrica label="Ingresos totales" valor={fmtPesos(totalIngresos)} sub={totalNoches > 0 ? `${fmtPesos(nocheProm)}/noche` : ''} color="#065F46" bg="#D1FAE5" grande />
        <Metrica label="Ticket promedio" valor={fmtPesos(ticketPromedio)} sub={`${totalNoches} noches totales`} color="#374151" bg="#F3F4F6" />
      </div>

      {pendientes.length > 0 && (
        <div style={s.alertaPendientes}>
          ⚠️ {pendientes.length} reserva{pendientes.length > 1 ? 's' : ''} pendiente{pendientes.length > 1 ? 's' : ''} de confirmar pago
        </div>
      )}

      <div style={s.grid2}>

        {/* Por propiedad */}
        {propId === 'todas' && porProp.length > 0 && (
          <Seccion titulo="Por propiedad">
            <table style={s.tabla}>
              <thead>
                <tr>
                  {['Propiedad','Reservas','Noches','Ocupación','Ingresos'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porProp.sort((a,b) => b.ingresos - a.ingresos).map(p => (
                  <tr key={p.id}>
                    <td style={s.td}><strong>{p.nombre}</strong></td>
                    <td style={{ ...s.td, textAlign: 'center' }}>{p.reservas}</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>{p.noches}</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <span style={{ ...s.ocpBadge, background: p.ocupacion > 70 ? '#D1FAE5' : p.ocupacion > 40 ? '#FEF3C7' : '#F3F4F6', color: p.ocupacion > 70 ? '#065F46' : p.ocupacion > 40 ? '#92400E' : '#374151' }}>
                        {p.ocupacion}%
                      </span>
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: '#2d5a3d' }}>{fmtPesos(p.ingresos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Seccion>
        )}

        {/* Por canal */}
        {Object.keys(canales).length > 0 && (
          <Seccion titulo="Por canal de origen">
            {Object.entries(canales)
              .sort((a,b) => b[1].count - a[1].count)
              .map(([canal, data]) => (
                <div key={canal} style={s.filaCanal}>
                  <div style={s.canalNombre}>{canal.charAt(0).toUpperCase() + canal.slice(1)}</div>
                  <div style={s.canalBar}>
                    <div style={{ ...s.canalBarFill, width: `${Math.round((data.count / reales.length) * 100)}%` }} />
                  </div>
                  <div style={s.canalCount}>{data.count} res.</div>
                  <div style={s.canalIngresos}>{fmtPesos(data.ingresos)}</div>
                </div>
              ))
            }
          </Seccion>
        )}
      </div>

      {/* Detalle de reservas */}
      <Seccion titulo={`Reservas del período (${reservas.length})`}>
        {reservas.length === 0 ? (
          <div style={s.vacio}>No hay reservas en este período</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tabla}>
              <thead>
                <tr>
                  {['Cliente','Propiedad','Check-in','Check-out','Noches','Precio','Canal','Estado'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reservas.map(r => {
                  const est = ESTADO_STYLE[r.estado] ?? { bg: '#f0f0f0', color: '#333' }
                  return (
                    <tr key={r.id}>
                      <td style={s.td}><strong>{r.clientes?.nombre} {r.clientes?.apellido}</strong></td>
                      <td style={s.td}>{r.propiedades?.nombre}</td>
                      <td style={s.td}>{fmtFecha(r.checkin)}</td>
                      <td style={s.td}>{fmtFecha(r.checkout)}</td>
                      <td style={{ ...s.td, textAlign: 'center' }}>{r.noches ?? '—'}</td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 500 }}>{r.precio_total ? fmtPesos(r.precio_total) : '—'}</td>
                      <td style={s.td}>{r.canal_origen ?? '—'}</td>
                      <td style={s.td}>
                        <span style={{ ...s.estadoBadge, background: est.bg, color: est.color }}>{r.estado}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function Metrica({ label, valor, sub, color, bg, grande }) {
  return (
    <div style={{ ...s.metricaCard, background: bg }}>
      <div style={s.metricaLabel}>{label}</div>
      <div style={{ ...s.metricaValor, color, fontSize: grande ? 28 : 32 }}>{valor}</div>
      {sub && <div style={{ ...s.metricaSub, color }}>{sub}</div>}
    </div>
  )
}

function Seccion({ titulo, children }) {
  return (
    <div style={s.card}>
      <div style={s.cardHeader}>{titulo}</div>
      <div style={s.cardBody}>{children}</div>
    </div>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 20px 60px', fontFamily: 'system-ui, -apple-system, sans-serif' },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  h1:     { fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', margin: 0, color: '#1a1814' },
  sub:    { fontSize: 13, color: '#888', marginTop: 4 },
  loadingBadge: { fontSize: 12, color: '#888', padding: '4px 12px', background: '#f0f0f0', borderRadius: 12, alignSelf: 'center' },

  filtrosCard: { background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: '16px 20px', marginBottom: 20 },
  filtrosRow:  { display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' },

  modoTabs:   { display: 'flex', gap: 4 },
  modoTab:    { padding: '7px 14px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#555' },
  modoTabActive: { background: '#2d5a3d', borderColor: '#2d5a3d', color: '#fff' },

  navMes:   { display: 'flex', alignItems: 'center', gap: 8 },
  navBtn:   { padding: '6px 12px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 16 },
  mesLabel: { fontSize: 15, fontWeight: 600, minWidth: 160, textAlign: 'center' },

  rangoRow:   { display: 'flex', gap: 12, alignItems: 'flex-end' },
  rangoField: { display: 'flex', flexDirection: 'column', gap: 4 },
  rangoLabel: { fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fafafa' },

  metricasGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 },
  metricaCard:  { borderRadius: 12, padding: '18px 20px' },
  metricaLabel: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#555', marginBottom: 6 },
  metricaValor: { fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 },
  metricaSub:   { fontSize: 12, marginTop: 4, opacity: 0.75 },

  alertaPendientes: { background: '#FEF3C7', color: '#92400E', borderLeft: '4px solid #F59E0B', padding: '10px 16px', borderRadius: 8, fontSize: 13, marginBottom: 16, fontWeight: 500 },

  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },

  card:       { background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  cardHeader: { padding: '14px 18px', borderBottom: '1px solid #f0f0f0', fontSize: 13, fontWeight: 600, color: '#1a1814', textTransform: 'uppercase', letterSpacing: '0.06em' },
  cardBody:   { padding: '0' },

  tabla: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:    { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' },
  td:    { padding: '10px 14px', borderBottom: '1px solid #f8f8f8', color: '#1a1814', fontSize: 13 },

  ocpBadge:    { fontSize: 12, padding: '2px 8px', borderRadius: 99, fontWeight: 600 },
  estadoBadge: { fontSize: 11, padding: '2px 9px', borderRadius: 99, fontWeight: 600 },

  filaCanal:      { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid #f8f8f8' },
  canalNombre:    { fontSize: 13, fontWeight: 500, minWidth: 80 },
  canalBar:       { flex: 1, height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' },
  canalBarFill:   { height: '100%', background: '#2d5a3d', borderRadius: 3, transition: 'width 0.4s' },
  canalCount:     { fontSize: 12, color: '#888', minWidth: 50, textAlign: 'right' },
  canalIngresos:  { fontSize: 13, fontWeight: 600, color: '#2d5a3d', minWidth: 90, textAlign: 'right' },

  vacio: { padding: '30px 18px', textAlign: 'center', color: '#bbb', fontSize: 13 },
}