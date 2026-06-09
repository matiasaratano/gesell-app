import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ─── iCal utilities ─────────────────────────────────────────────────────────────
function newIcalFeedRow() {
  return { id: crypto.randomUUID(), url: '', propiedad_id: '' }
}

async function fetchIcsText(url) {
  const res = await fetch(`/api/ical?url=${encodeURIComponent(url)}`)
  if (!res.ok) throw new Error('Error descargando iCal')
  return res.text()
}

function parseIcs(text) {
  const events = []
  const lines = text.split(/\r?\n/)
  let inEvent = false
  let event = {}
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) { inEvent = true; event = {} }
    else if (line.startsWith('END:VEVENT')) { inEvent = false; events.push(event) }
    else if (inEvent) {
      if (line.startsWith('DTSTART;')) event.start = line.replace('DTSTART;', '').split(':')[1]
      else if (line.startsWith('DTSTART:')) event.start = line.replace('DTSTART:', '')
      else if (line.startsWith('DTEND;')) event.end = line.replace('DTEND;', '').split(':')[1]
      else if (line.startsWith('DTEND:')) event.end = line.replace('DTEND:', '')
      else if (line.startsWith('SUMMARY:')) event.summary = line.replace('SUMMARY:', '')
      else if (line.startsWith('DESCRIPTION:')) event.description = line.replace('DESCRIPTION:', '')
    }
  }
  return events.map(e => {
    const formatDate = (d) => {
      if (!d) return ''
      return d.replace(/=$/, '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
    }
    return {
      start: formatDate(e.start),
      end: formatDate(e.end),
      summary: e.summary || '',
      description: e.description || '',
    }
  })
}

async function upsertIcalReservas(supabase, eventos, propiedadId, canal) {
  const stats = {
    total: eventos.length,
    inserted: 0,
    updated: 0,
    deduped: 0,
    conflicts: [],
  }

  for (const ev of eventos) {
    let checkin = ev.start?.slice(0, 10)
    let checkout = ev.end?.slice(0, 10)
    if (!checkin || !checkout) continue
    checkin = checkin.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
    checkout = checkout.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
    const esCerrada = (ev.summary || '').toUpperCase().includes('CLOSED')
    const payload = {
      propiedad_id: propiedadId,
      checkin,
      checkout,
      canal_origen: canal,
      estado: esCerrada ? 'cerrada' : 'confirmada',
    }

    const { data: overlaps, error } = await supabase
      .from('reservas')
      .select('id, checkin, checkout, estado, canal_origen')
      .eq('propiedad_id', propiedadId)
      .lt('checkin', checkout)
      .gt('checkout', checkin)
      .neq('estado', 'cancelada')

    if (error) throw error

    const exactMatches = (overlaps ?? []).filter(
      (row) => row.checkin === checkin && row.checkout === checkout && row.estado === payload.estado
    )

    if (exactMatches.length > 1) {
      const duplicateIds = exactMatches.slice(1).map((row) => row.id)
      const { error: deleteError } = await supabase.from('reservas').delete().in('id', duplicateIds)
      if (deleteError) throw deleteError
      stats.deduped += duplicateIds.length
    }

    const exactMatch = exactMatches[0]
    if (exactMatch?.id) {
      const { error: updateError } = await supabase.from('reservas').update(payload).eq('id', exactMatch.id)
      if (updateError) throw updateError
      stats.updated += 1
      continue
    }

    if ((overlaps ?? []).length > 0) {
      stats.conflicts.push({ checkin, checkout, estado: payload.estado })
      continue
    }

    const { error: insertError } = await supabase.from('reservas').insert(payload)
    if (insertError) throw insertError
    stats.inserted += 1
  }

  return stats
}

// ─── Constantes ────────────────────────────────────────────────────────────────
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const COLORES = ['#3B7DD8','#E07B39','#2E9E6B','#9B4FD8','#D83B6A','#0EA5B0','#C97B22','#5B6AD8']

const ESTADO_LABEL = {
  señada:     { label: 'Señada',     bg: '#FEF3C7', color: '#92400E' },
  pendiente:  { label: 'Pendiente',  bg: '#F3E8FF', color: '#6B21A8' },
  confirmada: { label: 'Confirmada', bg: '#D1FAE5', color: '#065F46' },
  activa:     { label: 'Activa',     bg: '#DBEAFE', color: '#1E40AF' },
  finalizada: { label: 'Finalizada', bg: '#F3F4F6', color: '#374151' },
  cerrada:    { label: 'Cerrada',    bg: '#E5E7EB', color: '#4B5563' },
  cancelada:  { label: 'Cancelada',  bg: '#FEE2E2', color: '#991B1B' },
}

// ─── Utilidades de fecha (sin timezone issues) ─────────────────────────────────
// IMPORTANTE: nunca usar new Date('YYYY-MM-DD') — lo parsea como UTC y da un día menos en Argentina
// Siempre construir dates desde números o comparar strings directamente

function padZ(n) { return String(n).padStart(2, '0') }

function toStr(year, month1, day) {
  return `${year}-${padZ(month1)}-${padZ(day)}`
}

function hoySrt() {
  const d = new Date()
  return toStr(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

function ultimoDiaMes(year, month0) {
  // new Date(year, month+1, 0) da el último día del mes (month es 0-indexed)
  return new Date(year, month0 + 1, 0).getDate()
}

function primerDiaSemana(year, month0) {
  // Domingo=0 ... Sábado=6
  return new Date(year, month0, 1).getDay()
}

// ─── Componente ────────────────────────────────────────────────────────────────
export default function Calendario() {
  const hoy = new Date()
  const autoSyncDoneRef = useRef(false)
  const [year,  setYear]  = useState(hoy.getFullYear())
  const [month, setMonth] = useState(hoy.getMonth()) // 0-indexed

  const [propiedades, setPropiedades] = useState([])
  const [reservas,    setReservas]    = useState([])
  const [filtro,      setFiltro]      = useState('todas')
  const [detalle,     setDetalle]     = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [syncing,     setSyncing]     = useState('')
  const [syncMsg,     setSyncMsg]     = useState('')
  const [modalIcal,   setModalIcal]   = useState(false)
  const [icalDraft,   setIcalDraft]   = useState(null)
  const [diaSeleccionado, setDiaSeleccionado] = useState(null)
  const [lastSyncAt,  setLastSyncAt]  = useState(null)

  async function loadIcalConfigFromSupabase() {
    const { data } = await supabase.from('propiedades').select('id, link_ical_booking, link_ical_airbnb')
    if (!data) return { booking: [], airbnb: [] }
    const booking = data.filter(p => p.link_ical_booking).map(p => ({ id: p.id, url: p.link_ical_booking, propiedad_id: p.id }))
    const airbnb = data.filter(p => p.link_ical_airbnb).map(p => ({ id: p.id, url: p.link_ical_airbnb, propiedad_id: p.id }))
    return { booking, airbnb }
  }

  useEffect(() => {
    loadIcalConfigFromSupabase().then(setIcalDraft)
  }, [])

  // ── Carga de datos ────────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Rango: primer y último día del mes visible
      const desde = toStr(year, month + 1, 1)
      const hasta = toStr(year, month + 1, ultimoDiaMes(year, month))

      const [resProps, resRes] = await Promise.all([
        supabase
          .from('propiedades')
          .select('id, nombre, activa')
          .order('nombre'),
        supabase
          .from('reservas')
          .select(`
            id, propiedad_id, checkin, checkout, noches,
            adultos, menores, mascotas, precio_total,
            estado, notas_internas, canal_origen,
            clientes ( nombre, apellido, whatsapp, dni ),
            propiedades ( nombre )
          `)
          .lte('checkin', hasta)
          .gt('checkout', desde)
          .neq('estado', 'cancelada')
          .order('checkin')
      ])

      if (resProps.error) throw resProps.error
      if (resRes.error)   throw resRes.error

      setPropiedades(resProps.data ?? [])
      setReservas(resRes.data ?? [])
    } catch (e) {
      setError('Error cargando datos: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (loading || syncing || autoSyncDoneRef.current || !icalDraft?.booking || !icalDraft?.airbnb) return
    const feeds = [...icalDraft.booking, ...icalDraft.airbnb].filter(f => f.url?.trim() && f.propiedad_id)
    if (!feeds.length) return
    autoSyncDoneRef.current = true
    const timer = setTimeout(() => sincronizarTodo({ silentSuccess: true }), 500)
    return () => clearTimeout(timer)
  }, [loading, syncing, icalDraft])

  // ── Construcción de celdas del calendario ─────────────────────────────────────
  // Siempre 42 celdas (6 filas × 7 columnas)
  const celdas = (() => {
    const firstDow    = primerDiaSemana(year, month)
    const diasMes     = ultimoDiaMes(year, month)
    const prevYear    = month === 0  ? year - 1 : year
    const prevMonth1  = month === 0  ? 12 : month        // 1-indexed
    const diasPrevMes = ultimoDiaMes(prevYear, month === 0 ? 11 : month - 1)
    const nextYear    = month === 11 ? year + 1 : year
    const nextMonth1  = month === 11 ? 1 : month + 2     // 1-indexed

    const arr = []

    // Días del mes anterior (padding izquierdo)
    for (let i = firstDow - 1; i >= 0; i--) {
      arr.push({
        ds:      toStr(prevYear, prevMonth1, diasPrevMes - i),
        actual:  false,
        dia:     diasPrevMes - i,
      })
    }

    // Días del mes actual
    for (let d = 1; d <= diasMes; d++) {
      arr.push({
        ds:     toStr(year, month + 1, d),
        actual: true,
        dia:    d,
      })
    }

    // Días del mes siguiente (padding derecho hasta 42)
    let nd = 1
    while (arr.length < 42) {
      arr.push({
        ds:     toStr(nextYear, nextMonth1, nd),
        actual: false,
        dia:    nd,
      })
      nd++
    }

    return arr
  })()

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function propColor(propId) {
    const idx = propiedades.findIndex(p => p.id === propId)
    return COLORES[(idx < 0 ? 0 : idx) % COLORES.length]
  }

  // Reservas que ocupan un día específico (string YYYY-MM-DD)
  function reservasDelDia(ds) {
    return reservas
      .filter(r => {
      if (filtro !== 'todas' && r.propiedad_id !== filtro) return false
      // checkin <= ds < checkout  (checkout no cuenta como noche ocupada)
      return r.checkin <= ds && r.checkout > ds
    })
      .sort((a, b) => {
        const indexA = propiedades.findIndex((p) => p.id === a.propiedad_id)
        const indexB = propiedades.findIndex((p) => p.id === b.propiedad_id)
        return indexA - indexB
      })
  }

  function navMes(dir) {
    if (dir === -1) {
      if (month === 0) { setYear(y => y - 1); setMonth(11) }
      else              setMonth(m => m - 1)
    } else {
      if (month === 11) { setYear(y => y + 1); setMonth(0) }
      else               setMonth(m => m + 1)
    }
  }

  function irAHoy() {
    const h = new Date()
    setYear(h.getFullYear())
    setMonth(h.getMonth())
  }

  const hoyStr = hoySrt()

  function cantidadFeeds(canal) {
    const rows = canal === 'booking' ? icalDraft?.booking : icalDraft?.airbnb
    return (rows ?? []).filter((f) => f.url?.trim() && f.propiedad_id).length
  }

  async function sincronizarCanal(canal, options = {}) {
    const { silentSuccess = false } = options
    const feeds = (canal === 'booking' ? icalDraft.booking : icalDraft.airbnb).filter(
      (f) => f.url?.trim() && f.propiedad_id
    )
    if (!feeds.length) {
      setSyncMsg(
        'Agregá al menos un enlace .ics y su propiedad en ⚙ Calendarios iCal (podés sumar varios alojamientos).'
      )
      return
    }

    setSyncing(canal)
    setSyncMsg('')
    try {
      let total = 0
      let totalInsertadas = 0
      let totalActualizadas = 0
      let totalDepuradas = 0
      const conflictos = []
      const detalles = []
      for (const feed of feeds) {
        const text = await fetchIcsText(feed.url)
        const events = parseIcs(text)
        if (events.length) {
          const resultado = await upsertIcalReservas(supabase, events, feed.propiedad_id, canal)
          total += events.length
          totalInsertadas += resultado.inserted
          totalActualizadas += resultado.updated
          totalDepuradas += resultado.deduped
          conflictos.push(...resultado.conflicts)
        }
        const nombreProp =
          propiedades.find((p) => p.id === feed.propiedad_id)?.nombre || '—'
        detalles.push(`${nombreProp}: ${events.length} evento(s)`)
      }
      await cargar()
      setLastSyncAt(new Date())
      if (total === 0) {
        setSyncMsg(
          `${canal === 'booking' ? 'Booking' : 'Airbnb'}: el .ics no trae eventos. Si no hay reservas en la plataforma, el archivo suele venir vacío; cuando haya reservas, volvé a sincronizar.`
        )
      } else if (!silentSuccess) {
        const partes = [
          `${canal === 'booking' ? 'Booking' : 'Airbnb'}: ${total} evento(s) leídos.`,
          `${totalInsertadas} alta(s) nuevas`,
          `${totalActualizadas} actualización(es)`,
        ]
        if (totalDepuradas > 0) partes.push(`${totalDepuradas} duplicado(s) limpiado(s)`)
        if (conflictos.length > 0) partes.push(`${conflictos.length} conflicto(s) omitido(s)`)
        setSyncMsg(`${partes.join(' · ')}. ${detalles.join(' · ')}`)
      }
    } catch (e) {
      setSyncMsg(e.message || String(e))
    } finally {
      setSyncing('')
    }
  }

  async function sincronizarTodo(options = {}) {
    const canales = ['booking', 'airbnb'].filter((canal) => cantidadFeeds(canal) > 0)
    if (!canales.length) {
      setSyncMsg(
        'Agregá al menos un enlace .ics y su propiedad en Importar desde canales para poder sincronizar.'
      )
      return
    }

    setSyncMsg('')
    for (const canal of canales) {
      await sincronizarCanal(canal, options)
    }
  }

  async function guardarIcalConfig() {
    const allFeeds = [...icalDraft.booking, ...icalDraft.airbnb]
    for (const feed of allFeeds) {
      if (feed.url?.trim() && !feed.propiedad_id) {
        setSyncMsg('Error: seleccioná la propiedad para cada link')
        return
      }
    }

    const promises = []
    
    // Obtener todas las propiedades para saber cuáles tienen links
    const { data: allProps } = await supabase.from('propiedades').select('id')
    const propIdsWithBooking = new Set(icalDraft.booking.filter(f => f.url?.trim() && f.propiedad_id).map(f => f.propiedad_id))
    const propIdsWithAirbnb = new Set(icalDraft.airbnb.filter(f => f.url?.trim() && f.propiedad_id).map(f => f.propiedad_id))
    
    // Guardar links activos
    for (const feed of icalDraft.booking) {
      if (feed.url?.trim() && feed.propiedad_id) {
        promises.push(
          supabase.from('propiedades').update({ link_ical_booking: feed.url }).eq('id', feed.propiedad_id)
        )
      }
    }
    for (const feed of icalDraft.airbnb) {
      if (feed.url?.trim() && feed.propiedad_id) {
        promises.push(
          supabase.from('propiedades').update({ link_ical_airbnb: feed.url }).eq('id', feed.propiedad_id)
        )
      }
    }
    
    // Limpiar propiedades que ya no tienen links
    for (const p of allProps || []) {
      if (!propIdsWithBooking.has(p.id)) {
        promises.push(supabase.from('propiedades').update({ link_ical_booking: null }).eq('id', p.id))
      }
      if (!propIdsWithAirbnb.has(p.id)) {
        promises.push(supabase.from('propiedades').update({ link_ical_airbnb: null }).eq('id', p.id))
      }
    }
    
    await Promise.all(promises)
    
    setModalIcal(false)
    setSyncMsg('Configuración de iCal guardada en la nube.')
  }

  function abrirModalIcal() {
    loadIcalConfigFromSupabase().then(d => {
      setIcalDraft({
        booking: d.booking.length ? d.booking : [newIcalFeedRow()],
        airbnb: d.airbnb.length ? d.airbnb : [newIcalFeedRow()],
      })
      setModalIcal(true)
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>

      {/* Barra superior */}
      <div style={s.topBar}>
        <div style={s.navGroup}>
          <button style={s.navBtn} onClick={() => navMes(-1)} aria-label="Mes anterior">‹</button>
          <span style={s.monthTitle}>{MESES[month]} {year}</span>
          <button style={s.navBtn} onClick={() => navMes(1)}  aria-label="Mes siguiente">›</button>
          <button style={{...s.navBtn, fontSize: 13, padding: '6px 12px'}} onClick={irAHoy}>Hoy</button>
        </div>
      </div>

      <div style={s.controlsRow}>
        <div style={s.rightControls}>
          <button
            type="button"
            style={{ ...s.importBtn }}
            onClick={abrirModalIcal}
            title="Configurar URLs de calendarios iCal"
          >
            📥 Importar desde canales
          </button>
          <button
            type="button"
            style={{ ...s.secondaryActionBtn, opacity: syncing ? 0.6 : 1 }}
            onClick={() => sincronizarTodo()}
            disabled={Boolean(syncing)}
            title="Volver a leer los calendarios iCal"
          >
            ↻ Sincronizar iCal
          </button>
          <select style={s.select} value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="todas">Todas las propiedades</option>
            {propiedades.map(p => (
              <option key={p.id} value={p.id}>
                {p.nombre}{p.activa === false ? ' (cerrada)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={s.statusRow}>
          <div style={s.statusSlot}>
            {loading && <span style={s.loadingBadge}>Cargando…</span>}
            {syncing !== '' && (
              <span style={s.loadingBadge}>Sincronizando {syncing}…</span>
            )}
            {!loading && !syncing && lastSyncAt && (
              <span style={s.lastSyncBadge}>
                ✓ Sync {lastSyncAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={s.errorBanner}>{error}</div>
      )}
      {syncMsg && (() => {
        const esError = syncMsg.toLowerCase().includes('error') || syncMsg.includes('Agregá') || syncMsg.includes('seleccioná')
        const esVacio = syncMsg.includes('no trae eventos')
        return (
          <div style={{
            padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13,
            borderLeft: '4px solid',
            background: esError ? '#FEF3C7' : esVacio ? '#F3F4F6' : '#EFF6FF',
            color:      esError ? '#92400E' : esVacio ? '#374151' : '#1D4ED8',
            borderLeftColor: esError ? '#F59E0B' : esVacio ? '#9CA3AF' : '#3B82F6',
          }}>
            {syncMsg}
          </div>
        )
      })()}

      {/* Leyenda de propiedades */}
      {propiedades.length > 0 && (
        <div style={s.legend}>
          {propiedades.map((p, i) => (
            <button
              key={p.id}
              style={{
                ...s.legendItem,
                opacity: filtro !== 'todas' && filtro !== p.id ? 0.4 : (p.activa === false ? 0.65 : 1),
                borderStyle: p.activa === false ? 'dashed' : 'solid',
              }}
              onClick={() => setFiltro(f => f === p.id ? 'todas' : p.id)}
              title={p.activa === false ? 'Propiedad marcada como cerrada / inactiva en Admin' : p.nombre}
            >
              <span style={{...s.dot, background: COLORES[i % COLORES.length]}} />
              {p.nombre}
              {p.activa === false && (
                <span style={{ fontSize: 10, color: '#999', marginLeft: 4 }}>(cerrada)</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Grid del calendario */}
      <div style={s.calendarWrapper}>
        {/* Encabezado días de semana */}
        <div style={s.gridHeader}>
          {DIAS.map(d => (
            <div key={d} style={s.dayHeaderCell}>{d}</div>
          ))}
        </div>

        {/* Celdas */}
        <div style={s.grid}>
          {celdas.map(({ ds, actual, dia }) => {
            const dayRes = reservasDelDia(ds)
            const esHoy  = ds === hoyStr

            return (
              <div
                key={ds}
                style={{
                  ...s.cell,
                  background: actual ? '#ffffff' : '#f8f8f8',
                }}
              >
                {/* Número del día */}
                <div style={{
                  ...s.dayNum,
                  ...(esHoy ? s.hoyNum : {}),
                  color: actual ? (esHoy ? '#fff' : '#1a1a1a') : '#c0c0c0',
                }}>
                  {dia}
                </div>

                {/* Barras de reservas */}
                <div style={s.barsContainer}>
                  {dayRes.slice(0, 3).map(r => (
                    <button
                      key={r.id}
                      onClick={() => setDetalle(r)}
                      style={{
                        ...s.bar,
                        background: propColor(r.propiedad_id),
                      }}
                      title={`${r.clientes?.nombre} ${r.clientes?.apellido} — ${r.propiedades?.nombre}`}
                    >
                      {r.clientes?.nombre} {r.clientes?.apellido?.[0]}.
                    </button>
                  ))}
                  {dayRes.length > 3 && (
                    <button
                      style={s.moreBadgeBtn}
                      onClick={() => setDiaSeleccionado({ ds, reservas: dayRes })}
                    >
                      +{dayRes.length - 3} más
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Resumen del mes */}
      <ResumenMes reservas={reservas} filtro={filtro} propiedades={propiedades} />

      {/* Modal de detalle */}
      {detalle && (
        <ModalDetalle
          reserva={detalle}
          color={propColor(detalle.propiedad_id)}
          onClose={() => setDetalle(null)}
          onActualizar={cargar}
        />
      )}

      {modalIcal && (
        <ModalIcal
          propiedades={propiedades}
          draft={icalDraft}
          setDraft={setIcalDraft}
          onGuardar={guardarIcalConfig}
          onClose={() => setModalIcal(false)}
        />
      )}

      {diaSeleccionado && (
        <ModalDiaReservas
          dia={diaSeleccionado}
          onClose={() => setDiaSeleccionado(null)}
          onVerDetalle={(r) => {
            setDiaSeleccionado(null)
            setDetalle(r)
          }}
          propColor={propColor}
        />
      )}
    </div>
  )
}

function ModalIcal({ propiedades, draft, setDraft, onGuardar, onClose }) {
  const [errorProp, setErrorProp] = useState('')

  function updateFeed(canal, id, patch) {
    setDraft((d) => ({
      ...d,
      [canal]: d[canal].map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }))
    setErrorProp('')
  }

  function removeFeed(canal, id) {
    setDraft((d) => ({
      ...d,
      [canal]: d[canal].filter((row) => row.id !== id),
    }))
  }

  function addFeed(canal) {
    setDraft((d) => ({
      ...d,
      [canal]: [...d[canal], newIcalFeedRow()],
    }))
  }

  function handleGuardar() {
    const allFeeds = [...draft.booking, ...draft.airbnb]
    const sinProp = allFeeds.find(f => f.url?.trim() && !f.propiedad_id)
    if (sinProp) {
      setErrorProp('Para cada link, seleccioná la propiedad asociada')
      return
    }
    onGuardar()
  }

  const propLabel = (p) =>
    `${p.nombre}${p.activa === false ? ' (cerrada)' : ''}`

  return (
    <div style={s.overlay} onClick={onClose}>
      <div
        style={{ ...s.modal, maxWidth: 620, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ ...s.modalHeader, borderLeft: '4px solid #2d5a3d', flexShrink: 0 }}>
          <div>
            <div style={s.modalNombre}>Importar desde canales</div>
            <div style={s.modalPropiedad}>
              Pegá la URL del calendario .ics de cada plataforma. Se sincroniza con las propiedades dadas de alta.
            </div>
          </div>
          <button style={s.closeBtn} onClick={onClose} type="button">✕</button>
        </div>
        <div style={{ ...s.modalBody, overflowY: 'auto', flex: 1 }}>
          <IcalImportChannel
            canal="booking"
            nombre="Booking.com"
            color="#0F4D90"
            rows={draft.booking}
            propiedades={propiedades}
            propLabel={propLabel}
            onChange={updateFeed}
            onRemove={removeFeed}
            onAdd={() => addFeed('booking')}
            urlPlaceholder="https://admin.booking.com/…/export/ical/calendar.ics"
            ayudaUrl="Booking → Extras → Calendarios → Copiar enlace del calendario"
          />
          <div style={{ height: 20 }} />
          <IcalImportChannel
            canal="airbnb"
            nombre="Airbnb"
            color="#FF5A5F"
            rows={draft.airbnb}
            propiedades={propiedades}
            propLabel={propLabel}
            onChange={updateFeed}
            onRemove={removeFeed}
            onAdd={() => addFeed('airbnb')}
            urlPlaceholder="https://www.airbnb.com/calendar/ical/XXXXXXX.ics"
            ayudaUrl="Airbnb → Calendario → Configuración → Enlace público del calendario"
          />
        </div>
        {errorProp && (
          <div style={{ padding: '10px 16px', background: '#FEE2E2', color: '#991B1B', fontSize: 13 }}>
            ⚠️ {errorProp}
          </div>
        )}
        <div style={s.modalFooter}>
          <button style={s.btnSecundario} type="button" onClick={onClose}>Cancelar</button>
          <button
            style={{ ...s.btnWA, background: '#2d5a3d' }}
            type="button"
            onClick={handleGuardar}
          >
            Guardar y cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function IcalImportChannel({
  canal,
  nombre,
  color,
  rows,
  propiedades,
  propLabel,
  onChange,
  onRemove,
  onAdd,
  urlPlaceholder,
  ayudaUrl,
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 700,
          fontSize: 11,
        }}>
          {nombre === 'Booking.com' ? 'B' : nombre === 'Airbnb' ? 'A' : nombre[0]}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a1a' }}>{nombre}</div>
          <div style={{ fontSize: 11, color: '#888' }}>{ayudaUrl}</div>
        </div>
      </div>
      {rows.map((row, idx) => (
        <div
          key={row.id}
          style={{
            border: '1px solid #e8e8e8',
            borderRadius: 12,
            padding: 14,
            marginBottom: 10,
            background: '#fafafa',
          }}
        >
          <div style={{ fontSize: 11, color: '#999', marginBottom: 8, fontWeight: 500 }}>
            Listing {idx + 1} {rows.length > 1 && `· ${propLabel(propiedades.find(p => p.id === row.propiedad_id) || { nombre: 'sin asignar', activa: false })}`}
          </div>
          <input
            type="url"
            style={s.icalInput}
            placeholder={urlPlaceholder}
            value={row.url}
            onChange={e => onChange(canal, row.id, { url: e.target.value })}
          />
          <div style={{ marginTop: 10 }}>
            <div style={s.datoLabel}>Vincular a propiedad *</div>
            <select
              style={s.select}
              value={row.propiedad_id}
              onChange={e => onChange(canal, row.id, { propiedad_id: e.target.value })}
            >
              <option value="">— Elegí la propiedad —</option>
              {propiedades.map(p => (
                <option key={p.id} value={p.id}>{propLabel(p)}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => onRemove(canal, row.id)}
            style={{
              marginTop: 10,
              border: 'none',
              background: 'none',
              color: '#991B1B',
              cursor: 'pointer',
              fontSize: 12,
              padding: 0,
            }}
          >
            ✕ Quitar
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        style={{
          ...s.btnSecundario,
          width: '100%',
          fontSize: 13,
          borderStyle: 'dashed',
        }}
      >
        + Agregar otro listing de {nombre}
      </button>
    </div>
  )
}

// ─── Resumen del mes ──────────────────────────────────────────────────────────
function ResumenMes({ reservas, filtro, propiedades }) {
  const filtradas = filtro === 'todas'
    ? reservas.filter(r => r.estado !== 'cerrada' && r.estado !== 'cancelada')
    : reservas.filter(r => r.propiedad_id === filtro && r.estado !== 'cerrada' && r.estado !== 'cancelada')

  if (filtradas.length === 0) return null

  const totalNoches   = filtradas.reduce((acc, r) => acc + (r.noches ?? 0), 0)
  const totalIngresos = filtradas.reduce((acc, r) => acc + (r.precio_total ?? 0), 0)
  const pendientes    = filtradas.filter(r => r.estado === 'señada' || r.estado === 'pendiente').length

  return (
    <div style={s.resumen}>
      <div style={s.resumenItem}>
        <span style={s.resumenLabel}>Reservas</span>
        <span style={s.resumenValor}>{filtradas.length}</span>
      </div>
      <div style={s.resumenItem}>
        <span style={s.resumenLabel}>Noches</span>
        <span style={s.resumenValor}>{totalNoches}</span>
      </div>
      {totalIngresos > 0 && (
        <div style={s.resumenItem}>
          <span style={s.resumenLabel}>Ingresos</span>
          <span style={s.resumenValor}>${totalIngresos.toLocaleString('es-AR')}</span>
        </div>
      )}
      {pendientes > 0 && (
        <div style={s.resumenItem}>
          <span style={s.resumenLabel}>Pendientes de pago</span>
          <span style={{ ...s.resumenValor, color: '#92400E' }}>{pendientes}</span>
        </div>
      )}
    </div>
  )
}

// ─── Modal de detalle de reserva ──────────────────────────────────────────────
function ModalDetalle({ reserva: r, color, onClose, onActualizar }) {
  const [cambiandoEstado, setCambiandoEstado] = useState(false)
  const [editando,        setEditando]        = useState(false)
  const [guardando,       setGuardando]       = useState(false)
  const [saveError,       setSaveError]       = useState('')
  const [form, setForm] = useState({
    checkin:      r.checkin,
    checkout:     r.checkout,
    precio_total: r.precio_total ?? '',
    adultos:      r.adultos ?? 1,
    menores:      r.menores ?? 0,
    notas_internas: r.notas_internas ?? '',
  })

  const estadoInfo = ESTADO_LABEL[r.estado] ?? { label: r.estado, bg: '#f0f0f0', color: '#333' }
  const waLink = r.clientes?.whatsapp
    ? `https://wa.me/${r.clientes.whatsapp.replace(/\D/g, '')}`
    : null

  // Noches calculadas dinámicamente en el form de edición
  const nochesForm = (() => {
    if (!form.checkin || !form.checkout) return 0
    const [y1,m1,d1] = form.checkin.split('-').map(Number)
    const [y2,m2,d2] = form.checkout.split('-').map(Number)
    return Math.max(0, Math.round((new Date(y2,m2-1,d2) - new Date(y1,m1-1,d1)) / 86400000))
  })()

  async function cambiarEstado(nuevoEstado) {
    setCambiandoEstado(true)
    const { error } = await supabase.from('reservas').update({ estado: nuevoEstado }).eq('id', r.id)
    setCambiandoEstado(false)
    if (error) {
      setSaveError(error.message || 'No se pudo cambiar el estado.')
      return
    }
    await onActualizar()
    onClose()
  }

  async function guardarCambios() {
    if (!form.checkin || !form.checkout) {
      setSaveError('Completá check-in y check-out.')
      return
    }
    if (form.checkout <= form.checkin) {
      setSaveError('El check-out tiene que ser posterior al check-in.')
      return
    }

    setSaveError('')
    setGuardando(true)

    const { data: solapadas, error: overlapError } = await supabase
      .from('reservas')
      .select('id, checkin, checkout')
      .eq('propiedad_id', r.propiedad_id)
      .neq('id', r.id)
      .lt('checkin', form.checkout)
      .gt('checkout', form.checkin)
      .neq('estado', 'cancelada')

    if (overlapError) {
      setGuardando(false)
      setSaveError(overlapError.message || 'No se pudo validar la disponibilidad.')
      return
    }

    if ((solapadas ?? []).length > 0) {
      setGuardando(false)
      setSaveError('Ese rango se superpone con otra reserva de la misma propiedad.')
      return
    }

    const payload = {
      checkin:        form.checkin,
      checkout:       form.checkout,
      precio_total:   form.precio_total !== '' ? Number(form.precio_total) : null,
      adultos:        Number(form.adultos),
      menores:        Number(form.menores),
      notas_internas: form.notas_internas.trim() || null,
    }
    const { error } = await supabase.from('reservas').update(payload).eq('id', r.id)
    if (error) {
      setGuardando(false)
      setSaveError(error.message || 'No se pudieron guardar los cambios.')
      return
    }
    await onActualizar()
    setGuardando(false)
    setEditando(false)
    onClose()
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.modal, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

        {/* Encabezado */}
        <div style={{ ...s.modalHeader, borderLeft: `4px solid ${color}`, flexShrink: 0 }}>
          <div>
            <div style={s.modalNombre}>
              {r.clientes?.nombre} {r.clientes?.apellido}
            </div>
            <div style={s.modalPropiedad}>{r.propiedades?.nombre}</div>
          </div>
          <div style={s.modalHeaderRight}>
            <span style={{ ...s.estadoBadge, background: estadoInfo.bg, color: estadoInfo.color }}>
              {estadoInfo.label}
            </span>
            <button style={s.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Cuerpo scrolleable */}
        <div style={{ ...s.modalBody, overflowY: 'auto', flex: 1 }}>

          {/* ── Modo visualización ── */}
          {!editando && (
            <>
              <div style={s.modalGrid}>
                <DatoModal label="Check-in"  value={formatFecha(r.checkin)} />
                <DatoModal label="Check-out" value={formatFecha(r.checkout)} />
                <DatoModal label="Noches"    value={r.noches} />
                <DatoModal label="Adultos"   value={r.adultos} />
                {r.menores > 0 && <DatoModal label="Menores" value={r.menores} />}
                {r.mascotas  && <DatoModal label="Mascotas" value="Sí 🐾" />}
                <DatoModal label="Total" value={r.precio_total ? `$${Number(r.precio_total).toLocaleString('es-AR')}` : '—'} highlight />
                {r.clientes?.dni      && <DatoModal label="DNI"       value={r.clientes.dni} />}
                {r.clientes?.whatsapp && <DatoModal label="WhatsApp"  value={r.clientes.whatsapp} />}
                <DatoModal label="Canal" value={r.canal_origen ? capitalizar(r.canal_origen) : '—'} />
              </div>

              {r.notas_internas && (
                <div style={s.notasBox}>
                  <span style={s.notasLabel}>Notas</span>
                  {r.notas_internas}
                </div>
              )}
            </>
          )}

          {/* ── Modo edición ── */}
          {editando && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={s.datoLabel}>Check-in</div>
                  <input
                    type="date" style={s.inputEdit}
                    value={form.checkin}
                    onChange={e => setForm(f => ({ ...f, checkin: e.target.value }))}
                  />
                </div>
                <div>
                  <div style={s.datoLabel}>Check-out</div>
                  <input
                    type="date" style={s.inputEdit}
                    value={form.checkout}
                    onChange={e => setForm(f => ({ ...f, checkout: e.target.value }))}
                  />
                </div>
              </div>

              {nochesForm > 0 && (
                <div style={{ fontSize: 12, color: '#2d5a3d', fontWeight: 600 }}>
                  {nochesForm} {nochesForm === 1 ? 'noche' : 'noches'}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <div style={s.datoLabel}>Total $</div>
                  <input
                    type="number" style={s.inputEdit}
                    placeholder="0"
                    value={form.precio_total}
                    onChange={e => setForm(f => ({ ...f, precio_total: e.target.value }))}
                  />
                </div>
                <div>
                  <div style={s.datoLabel}>Adultos</div>
                  <input
                    type="number" min={1} max={20} style={s.inputEdit}
                    value={form.adultos}
                    onChange={e => setForm(f => ({ ...f, adultos: e.target.value }))}
                  />
                </div>
                <div>
                  <div style={s.datoLabel}>Menores</div>
                  <input
                    type="number" min={0} max={20} style={s.inputEdit}
                    value={form.menores}
                    onChange={e => setForm(f => ({ ...f, menores: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <div style={s.datoLabel}>Notas internas</div>
                <textarea
                  style={{ ...s.inputEdit, minHeight: 64, resize: 'vertical' }}
                  placeholder="Observaciones, acuerdos, etc."
                  value={form.notas_internas}
                  onChange={e => setForm(f => ({ ...f, notas_internas: e.target.value }))}
                />
              </div>

              {saveError && (
                <div style={s.inlineError}>
                  {saveError}
                </div>
              )}
            </div>
          )}

          {/* Cambiar estado (siempre visible) */}
          <div style={{ ...s.estadosSection, marginTop: 16 }}>
            <div style={s.estadosLabel}>Cambiar estado</div>
            <div style={s.estadosBtns}>
              {Object.entries(ESTADO_LABEL).map(([key, val]) => (
                <button
                  key={key}
                  disabled={r.estado === key || cambiandoEstado || guardando}
                  onClick={() => cambiarEstado(key)}
                  style={{
                    ...s.estadoBtn,
                    background: val.bg,
                    color:      val.color,
                    opacity:    r.estado === key ? 1 : 0.7,
                    fontWeight: r.estado === key ? 600 : 400,
                    cursor:     r.estado === key ? 'default' : 'pointer',
                  }}
                >
                  {val.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ ...s.modalFooter, flexShrink: 0, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {waLink && (
              <a href={waLink} target="_blank" rel="noreferrer" style={s.btnWA}>
                WhatsApp
              </a>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {editando ? (
              <>
                <button style={s.btnSecundario} onClick={() => setEditando(false)} disabled={guardando}>
                  Cancelar
                </button>
                <button
                  style={{ ...s.btnWA, background: '#2d5a3d', opacity: guardando ? 0.7 : 1 }}
                  onClick={guardarCambios}
                  disabled={guardando}
                >
                  {guardando ? 'Guardando…' : '✓ Guardar'}
                </button>
              </>
            ) : (
              <>
                <button
                  style={{ ...s.btnSecundario, borderColor: '#2d5a3d', color: '#2d5a3d' }}
                  onClick={() => setEditando(true)}
                >
                  Editar
                </button>
                <button style={s.btnSecundario} onClick={onClose}>Cerrar</button>
              </>
            )}
          </div>
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

function ModalDiaReservas({ dia, onClose, onVerDetalle, propColor }) {
  const [y, m, d] = dia.ds.split('-')
  const fechaFormateada = `${d}/${m}/${y}`
  
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.modal, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...s.modalHeader, borderLeft: '4px solid #2d5a3d' }}>
          <div>
            <div style={s.modalNombre}>Reservas del {fechaFormateada}</div>
            <div style={s.modalPropiedad}>{dia.reservas.length} reserva(s) este día</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={s.modalBody}>
          {dia.reservas.map(r => (
            <button
              key={r.id}
              onClick={() => onVerDetalle(r)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                padding: '10px 12px',
                marginBottom: 8,
                background: '#f8f8f8',
                border: '1px solid #e8e8e8',
                borderRadius: 10,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: propColor(r.propiedad_id),
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a1a' }}>
                  {r.clientes?.nombre} {r.clientes?.apellido}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {r.propiedades?.nombre}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>
                {ESTADO_LABEL[r.estado]?.label || r.estado}
              </div>
            </button>
          ))}
        </div>
        <div style={s.modalFooter}>
          <button style={s.btnSecundario} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

function formatFecha(str) {
  if (!str) return '—'
  // str es YYYY-MM-DD, la construimos a mano para evitar timezone
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

function capitalizar(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = {
  page:          { maxWidth: 1000, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' },
  topBar:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 },
  controlsRow:   { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginBottom: 16 },
  navGroup:      { display: 'flex', alignItems: 'center', gap: 8 },
  navBtn:        { padding: '6px 14px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 18, fontWeight: 500, lineHeight: 1 },
  monthTitle:    { fontSize: 20, fontWeight: 600, minWidth: 210, textAlign: 'center', letterSpacing: '-0.02em' },
  rightControls: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statusRow:     { minHeight: 28, display: 'flex', alignItems: 'center' },
  statusSlot:    { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  loadingBadge:  { fontSize: 12, color: '#888', padding: '4px 10px', background: '#f0f0f0', borderRadius: 12 },
  lastSyncBadge: { fontSize: 12, color: '#2d5a3d', padding: '4px 10px', background: '#E8F5EC', borderRadius: 12 },
  select:        { padding: '7px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, background: '#fff', cursor: 'pointer' },
  importBtn:     { padding: '7px 14px', border: '1px solid #2d5a3d', borderRadius: 8, background: '#2d5a3d', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  secondaryActionBtn: { padding: '7px 14px', border: '1px solid #d6dfd9', borderRadius: 8, background: '#fff', color: '#2d5a3d', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  inputEdit:     { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: '#fafafa' },
  errorBanner:   { background: '#FEE2E2', color: '#991B1B', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 },
  syncBanner:    { background: '#e8f0eb', color: '#2d5a3d', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 },
  moreBadgeBtn:  { fontSize: 11, color: '#2d5a3d', padding: '2px 6px', cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left', width: '100%', fontWeight: 500 },

  legend:     { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#444', background: 'none', border: '1px solid #e8e8e8', borderRadius: 20, padding: '4px 12px', cursor: 'pointer', transition: 'opacity .2s' },
  dot:        { width: 10, height: 10, borderRadius: 3, flexShrink: 0 },

  calendarWrapper: { borderRadius: 12, overflow: 'hidden', border: '1px solid #e8e8e8', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  gridHeader:      { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f5f5f5' },
  dayHeaderCell:   { padding: '10px 0', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#666', letterSpacing: '0.05em', textTransform: 'uppercase' },

  grid:          { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: '#e8e8e8' },
  cell:          { minHeight: 90, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 },
  dayNum:        { fontSize: 13, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', marginBottom: 2, flexShrink: 0 },
  hoyNum:        { background: '#2d5a3d', color: '#fff', fontWeight: 700 },

  barsContainer: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },
  bar:           { fontSize: 11, color: '#fff', padding: '2px 6px', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500, border: 'none', textAlign: 'left', width: '100%' },

  resumen:      { display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' },
  resumenItem:  { display: 'flex', flexDirection: 'column', gap: 2 },
  resumenLabel: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' },
  resumenValor: { fontSize: 20, fontWeight: 600, color: '#1a1a1a' },

  overlay:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal:        { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460, boxShadow: '0 24px 64px rgba(0,0,0,0.18)', overflow: 'hidden' },

  modalHeader:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px 0', paddingLeft: 20 },
  modalNombre:      { fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' },
  modalPropiedad:   { fontSize: 13, color: '#888', marginTop: 2 },
  modalHeaderRight: { display: 'flex', alignItems: 'center', gap: 10 },
  estadoBadge:      { fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 600 },
  closeBtn:         { border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: '#bbb', padding: 0, lineHeight: 1 },

  modalBody:    { padding: '16px 24px' },
  modalGrid:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px', marginBottom: 16 },
  datoLabel:    { fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 },
  datoValor:    { fontSize: 14, fontWeight: 500, color: '#1a1a1a' },

  notasBox:     { background: '#f8f8f8', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#555', marginBottom: 16, lineHeight: 1.5 },
  notasLabel:   { display: 'block', fontWeight: 600, color: '#333', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' },
  inlineError:  { fontSize: 12, color: '#991B1B', background: '#FEE2E2', padding: '10px 12px', borderRadius: 8 },

  estadosSection: { borderTop: '1px solid #f0f0f0', paddingTop: 14 },
  estadosLabel:   { fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 },
  estadosBtns:    { display: 'flex', gap: 6, flexWrap: 'wrap' },
  estadoBtn:      { fontSize: 12, padding: '4px 12px', borderRadius: 20, border: 'none', transition: 'opacity .15s' },

  modalFooter:   { display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 24px', borderTop: '1px solid #f0f0f0' },
  btnWA:         { padding: '8px 18px', borderRadius: 8, background: '#25D366', color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 500 },
  btnSecundario: { padding: '8px 18px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 14 },
}