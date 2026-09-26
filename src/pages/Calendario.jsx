import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react'
import { supabase, supabaseIcal, supabaseAutomatico } from '../lib/supabase'
import { Link, useNavigate } from 'react-router-dom'
import { celdasMes } from '../lib/calendario-grid.js'

// ─── iCal utilities ─────────────────────────────────────────────────────────────
function newIcalFeedRow() {
  return { id: crypto.randomUUID(), url: '', propiedad_id: '' }
}

async function fetchIcsText(url) {
  const res = await fetch(`/api/ical?url=${encodeURIComponent(url)}`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Error descargando iCal')
  return res.text()
}

import { parseIcs } from '../lib/ical-sync.js'
import { leerSnapshotIcal, sincronizarIcal } from '../lib/ical-transaction.js'

// ─── Constantes ────────────────────────────────────────────────────────────────
const MESES      = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun',
                     'Jul','Ago','Sep','Oct','Nov','Dic']
const DIAS        = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const DIAS_CORTO  = ['D','L','M','X','J','V','S']
const COLORES = ['#3B7DD8','#E07B39','#2E9E6B','#9B4FD8','#D83B6A','#0EA5B0','#C97B22','#5B6AD8']

// ─── Hook responsive ─────────────────────────────────────────────────────────
function useDeviceType() {
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (width < 600) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

function useIsMobile(breakpoint = 600) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    setIsMobile(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return isMobile
}

const ESTADO_LABEL = {
  pendiente:  { label: 'Pendiente',  bg: '#F3E8FF', color: '#6B21A8' },
  confirmada: { label: 'Confirmada', bg: '#D1FAE5', color: '#065F46' },
  finalizada: { label: 'Finalizada', bg: '#F3F4F6', color: '#374151' },
  cerrada:    { label: 'Cerrada',    bg: '#E5E7EB', color: '#4B5563' },
}

const ESTADOS_EDITABLES = ['pendiente', 'confirmada', 'finalizada']

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

function esDiaPasado(ds) {
  return ds < hoySrt()
}

function ultimoDiaMes(year, month0) {
  // new Date(year, month+1, 0) da el último día del mes (month es 0-indexed)
  return new Date(year, month0 + 1, 0).getDate()
}

function diffNoches(desde, hasta) {
  if (!desde || !hasta) return 0
  const [y1, m1, d1] = desde.split('-').map(Number)
  const [y2, m2, d2] = hasta.split('-').map(Number)
  const a = new Date(y1, m1 - 1, d1)
  const b = new Date(y2, m2 - 1, d2)
  return Math.max(0, Math.round((b - a) / 86400000))
}

function estadoVisualReserva(r) {
  if (!r) return 'pendiente'
  if (r.estado === 'cerrada') return 'cerrada'
  if (r.checkout && r.checkout < hoySrt()) return 'finalizada'
  if (r.estado === 'señada' || r.estado === 'activa') return 'confirmada'
  if (r.estado === 'cancelada') return 'pendiente'
  return r.estado || 'pendiente'
}

function nombreReserva(r) {
  const cliente = `${r.clientes?.nombre || ''} ${r.clientes?.apellido || ''}`.trim()
  if (cliente) return cliente
  if (r.estado === 'cerrada') return tipoCierreReserva(r)
  return 'Sin cliente'
}

function nombreCortoReserva(r) {
  const cliente = `${r.clientes?.nombre || ''} ${r.clientes?.apellido?.[0] || ''}`.trim()
  if (cliente) return r.clientes?.apellido ? `${r.clientes.nombre} ${r.clientes.apellido[0]}.` : r.clientes?.nombre
  if (r.estado === 'cerrada') return tipoCierreReserva(r)
  return 'Sin cliente'
}

function esCierreManual(r) {
  return r?.estado === 'cerrada' && ['directo', 'manual'].includes(r.canal_origen)
}

function nombreCanal(canal) {
  if (canal === 'booking') return 'Booking'
  if (canal === 'airbnb') return 'Airbnb'
  if (canal === 'directo' || canal === 'manual') return 'Manual'
  return canal ? capitalizar(canal) : 'Manual'
}

function tipoCierreReserva(r) {
  if (esCierreManual(r)) return 'Cierre manual'
  return `Cierre ${nombreCanal(r?.canal_origen)}`
}

function esReservaPasada(r) {
  return r?.estado === 'finalizada' || (!!r?.checkout && r.checkout < hoySrt())
}

// ─── Componente ────────────────────────────────────────────────────────────────
export default function Calendario() {
  const device = useDeviceType()
  const isMobile = device === 'mobile'
  const isTablet = device === 'tablet'
  const isDesktop = device === 'desktop'
  const navigate = useNavigate()

  const hoy = new Date()
  const autoSyncDoneRef = useRef(false)
  const cargaIdRef = useRef(0)
  const cargarActualRef = useRef(null)
  const mesCargadoRef = useRef(null)
  const syncEnCursoRef = useRef(false)
  const [year,  setYear]  = useState(hoy.getFullYear())
  const [month, setMonth] = useState(hoy.getMonth()) // 0-indexed

  const [propiedades, setPropiedades] = useState([])
  const [reservas,    setReservas]    = useState([])
  const [bloqueos,    setBloqueos]    = useState([])  // noches cerradas
  const [filtro,      setFiltro]      = useState('todas')
  const [detalle,     setDetalle]     = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [syncing,     setSyncing]     = useState('')
  const [syncMsg,     setSyncMsg]     = useState('')
  const [syncReport,  setSyncReport]  = useState(null) // reporte detallado post-importación
  const [modalIcal,   setModalIcal]   = useState(false)
  const [icalDraft,   setIcalDraft]   = useState(null)
  const [diaSeleccionado, setDiaSeleccionado] = useState(null)
  const [lastSyncAt,  setLastSyncAt]  = useState(null)
  const [modalBloqueo, setModalBloqueo] = useState(false)
  const [bloqueoSeleccionado, setBloqueoSeleccionado] = useState(null) // bloqueo a abrir

  const [vista, setVista] = useState('grilla') // 'grilla' | 'timeline'

  // Selección de rango
  const [rangoInicio, setRangoInicio] = useState(null)
  const [rangoFin, setRangoFin] = useState(null)
  const [rangoPropId, setRangoPropId] = useState(null)

  const diasMesActual = useMemo(() => {
    const total = ultimoDiaMes(year, month)
    const arr = []
    for (let d = 1; d <= total; d++) {
      const dateStr = toStr(year, month + 1, d)
      const dow = new Date(year, month, d).getDay()
      arr.push({
        d,
        ds: dateStr,
        dow,
      })
    }
    return arr
  }, [year, month])

  const reservasSolapadas = useMemo(() => {
    if (!rangoInicio || !rangoFin) return []
    const targetPropId = rangoPropId || (filtro !== 'todas' ? filtro : null)
    return reservas.filter(r => {
      if (targetPropId && r.propiedad_id !== targetPropId) return false
      return r.checkin < rangoFin && r.checkout > rangoInicio
    })
  }, [rangoInicio, rangoFin, reservas, filtro, rangoPropId])

  const handleCellClick = (ds, propId = null) => {
    if (!rangoInicio || (rangoInicio && rangoFin) || (rangoPropId && rangoPropId !== propId)) {
      setRangoInicio(ds)
      setRangoFin(null)
      setRangoPropId(propId)
    } else {
      if (ds < rangoInicio) {
        setRangoInicio(ds)
        setRangoPropId(propId)
      } else if (ds === rangoInicio) {
        setRangoInicio(null)
        setRangoFin(null)
        setRangoPropId(null)
      } else {
        setRangoFin(ds)
      }
    }
  }

  const clearRango = () => {
    setRangoInicio(null)
    setRangoFin(null)
    setRangoPropId(null)
  }

  const handleCrearReserva = () => {
    if (!rangoInicio || !rangoFin) return
    const query = new URLSearchParams()
    query.set('checkin', rangoInicio)
    query.set('checkout', rangoFin)
    const selectedPropId = rangoPropId || (filtro !== 'todas' ? filtro : '')
    if (selectedPropId) {
      query.set('propiedad_id', selectedPropId)
    }
    query.set('estado', 'confirmada')
    navigate(`/nueva?${query.toString()}`)
  }

  const handleVerModificarReservas = () => {
    if (reservasSolapadas.length === 1) {
      navigate(`/reservas/${reservasSolapadas[0].id}`)
    } else if (reservasSolapadas.length > 1) {
      setDiaSeleccionado({
        ds: `${rangoInicio} al ${rangoFin}`,
        reservas: reservasSolapadas,
      })
    }
  }

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
  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    const cargaId = ++cargaIdRef.current
    const mantenerVista = silencioso && mesCargadoRef.current === `${year}-${month}`
    if (!mantenerVista) setLoading(true)
    setError(null)
    try {
      const visibles = celdasMes(year, month)
      const desde = visibles[0].ds
      const hasta = visibles.at(-1).ds
      const hoy = hoySrt()

      await supabaseAutomatico
        .from('reservas')
        .update({ estado: 'finalizada' })
        .lt('checkout', hoy)
        .not('estado', 'in', '("finalizada","cancelada","cerrada")')

      if (cargaId !== cargaIdRef.current) return

      const [resProps, resRes, resBloqueos] = await Promise.all([
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
          .order('checkin'),
        supabase
          .from('bloqueos')
          .select('id, propiedad_id, fecha_inicio, fecha_fin, motivo')
          .lte('fecha_inicio', hasta)
          .gte('fecha_fin', desde)
      ])

      if (cargaId !== cargaIdRef.current) return
      if (resProps.error) throw resProps.error
      if (resRes.error)   throw resRes.error
      // bloqueos table may not exist yet; ignore error gracefully
      setBloqueos(resBloqueos.data ?? [])

      setReservas(resRes.data ?? [])

      setPropiedades(resProps.data ?? [])
      mesCargadoRef.current = `${year}-${month}`
      return true
    } catch (e) {
      if (cargaId === cargaIdRef.current) {
        if (mantenerVista) setSyncMsg('No se pudo actualizar la vista. Se muestran las fechas anteriores: ' + e.message)
        else setError('Error cargando datos: ' + e.message)
      }
      return false
    } finally {
      if (cargaId === cargaIdRef.current) setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    cargarActualRef.current = cargar
    cargar()
    return () => {
      cargaIdRef.current += 1
      cargarActualRef.current = null
    }
  }, [cargar])

  useEffect(() => {
    if (loading || syncing || autoSyncDoneRef.current || !icalDraft?.booking || !icalDraft?.airbnb) return
    const feeds = [...icalDraft.booking, ...icalDraft.airbnb].filter(f => f.url?.trim() && f.propiedad_id)
    if (!feeds.length) return
    const timer = setTimeout(() => {
      autoSyncDoneRef.current = true
      sincronizarTodo({ silentSuccess: true })
    }, 500)
    return () => clearTimeout(timer)
  }, [loading, syncing, icalDraft])

  // ── Construcción de celdas del calendario ─────────────────────────────────────
  // Siempre 42 celdas (6 filas × 7 columnas)
  const celdas = celdasMes(year, month)

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

  // Bloqueos que cubren un día y propiedad dados
  function bloqueosDelDia(ds, propId = null) {
    return bloqueos.filter(b => {
      if (propId && b.propiedad_id !== propId) return false
      if (!propId && filtro !== 'todas' && b.propiedad_id !== filtro) return false
      return b.fecha_inicio <= ds && b.fecha_fin > ds
    })
  }

  async function handleCerrarNoches() {
    setModalBloqueo(true)
  }

  async function guardarBloqueo({ propiedadId, motivo }) {
    if (!rangoInicio || !rangoFin) return
    if (!propiedadId) return { message: 'Seleccioná una propiedad.' }

    const [resReservas, resBloqueos] = await Promise.all([
      supabase
        .from('reservas')
        .select('id, checkin, checkout, estado, clientes(nombre, apellido)')
        .eq('propiedad_id', propiedadId)
        .neq('estado', 'cancelada')
        .lt('checkin', rangoFin)
        .gt('checkout', rangoInicio),
      supabase
        .from('bloqueos')
        .select('id, fecha_inicio, fecha_fin, motivo')
        .eq('propiedad_id', propiedadId)
        .lt('fecha_inicio', rangoFin)
        .gt('fecha_fin', rangoInicio),
    ])

    if (resReservas.error) return resReservas.error
    if (resBloqueos.error && resBloqueos.error.code !== '42P01') return resBloqueos.error

    if ((resReservas.data ?? []).length > 0) {
      return { message: 'Ese rango se superpone con una reserva o cierre existente.' }
    }
    if ((resBloqueos.data ?? []).length > 0) {
      return { message: 'Ese rango ya tiene un bloqueo manual anterior.' }
    }

    const { error } = await supabase.from('reservas').insert({
      propiedad_id: propiedadId,
      checkin: rangoInicio,
      checkout: rangoFin,
      estado: 'cerrada',
      canal_origen: 'directo',
      notas_internas: motivo?.trim() || 'Cierre manual',
    })
    if (!error) {
      await cargarActualRef.current?.()
      clearRango()
      setModalBloqueo(false)
    }
    return error
  }

  async function abrirBloqueo(bloqueoId) {
    const { error } = await supabase.from('bloqueos').delete().eq('id', bloqueoId)
    if (!error) {
      await cargarActualRef.current?.()
      setBloqueoSeleccionado(null)
    }
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

  async function sincronizarCanal(canal) {
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
      let totalActualizadas = 0
      let totalReabiertas = 0
      let totalReservas = 0
      let totalBloqueadas = 0
      const conflictos = []
      const propDetalles = [] // { nombre, reservas: [], bloqueadas: N, actualizadas: N }

      const snapshots = new Map()
      const reservasAntes = new Map()
      for (const propiedadId of new Set(feeds.map(f => f.propiedad_id))) {
        reservasAntes.set(propiedadId, await leerSnapshotIcal(supabaseIcal, propiedadId))
      }
      for (const feed of feeds) {
        const text = await fetchIcsText(feed.url)
        const events = parseIcs(text)
        snapshots.set(feed.propiedad_id, [...(snapshots.get(feed.propiedad_id) || []), ...events])
      }
      for (const [propiedadId, events] of snapshots) {
        const nombreProp = propiedades.find((p) => p.id === propiedadId)?.nombre || '—'
        const resultado = await sincronizarIcal(supabaseIcal, events, propiedadId, canal, reservasAntes.get(propiedadId))
        const { reabiertas } = resultado
        totalReabiertas += reabiertas
        total += events.length
        totalActualizadas += resultado.updated
        totalReservas += resultado.insertedReservas
        totalBloqueadas += resultado.insertedBloqueadas
        conflictos.push(...resultado.conflicts.map(c => ({ ...c, propiedad: nombreProp })))
        propDetalles.push({
          nombre: nombreProp,
          reservasNuevas: resultado.nuevas,
          bloqueadasNuevas: resultado.insertedBloqueadas,
          actualizadas: resultado.updated,
          reabiertas,
          conservadas: resultado.skipped,
        })
      }
      return {
          canal: canal === 'booking' ? 'Booking' : 'Airbnb',
          total,
          totalReservas,
          totalBloqueadas,
          totalActualizadas,
          totalReabiertas,
          conflictos,
          propDetalles,
      }
    } catch (e) {
      const message = `${canal === 'booking' ? 'Booking' : 'Airbnb'}: ${e.message || String(e)}`
      setSyncMsg(message)
      return message
    }
  }

  async function sincronizarTodo(options = {}) {
    if (syncEnCursoRef.current) return
    const canales = ['booking', 'airbnb'].filter((canal) => cantidadFeeds(canal) > 0)
    if (!canales.length) {
      setSyncMsg(
        'Agregá al menos un enlace .ics y su propiedad en Importar desde canales para poder sincronizar.'
      )
      return
    }

    syncEnCursoRef.current = true
    setSyncMsg('')
    setSyncReport(null)
    try {
      const errores = []
      const reportes = []
      for (const canal of canales) {
        const resultado = await sincronizarCanal(canal)
        if (typeof resultado === 'string') errores.push(resultado)
        else if (resultado) reportes.push(resultado)
      }
      // Refresh once after both channels; keep the current month mounted while reading.
      const actualizado = await cargarActualRef.current?.({ silencioso: true })
      if (errores.length) setSyncMsg(errores.join(' · ') + (actualizado === false ? ' · No se pudo actualizar la vista del calendario.' : ''))
      else if (actualizado) setLastSyncAt(new Date())
      if (!options.silentSuccess && reportes.length) {
        const total = campo => reportes.reduce((n, r) => n + r[campo], 0)
        setSyncReport({
          canal: reportes.map(r => r.canal).join(' + '),
          total: total('total'), totalReservas: total('totalReservas'), totalBloqueadas: total('totalBloqueadas'),
          totalActualizadas: total('totalActualizadas'), totalReabiertas: total('totalReabiertas'),
          conflictos: reportes.flatMap(r => r.conflictos),
          propDetalles: reportes.flatMap(r => r.propDetalles.map(p => ({ ...p, nombre: `${p.nombre} · ${r.canal}` }))),
        })
      }
    } finally {
      syncEnCursoRef.current = false
      setSyncing('')
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
    <div style={{ ...s.page, padding: isMobile ? '8px 8px 60px' : '24px 16px' }}>

      {/* Barra superior */}
      <div style={{ ...s.topBar, flexWrap: 'wrap', gap: isMobile ? 8 : 12 }}>
        <div style={s.navGroup}>
          <button style={s.navBtn} onClick={() => navMes(-1)} aria-label="Mes anterior">‹</button>
          <span style={{ ...s.monthTitle, fontSize: isMobile ? 16 : 20, minWidth: isMobile ? 'auto' : 210 }}>
            {isMobile ? MESES_CORTO[month] : MESES[month]} {year}
          </span>
          <button style={s.navBtn} onClick={() => navMes(1)}  aria-label="Mes siguiente">›</button>
          <button style={{...s.navBtn, fontSize: 13, padding: '6px 12px'}} onClick={irAHoy}>Hoy</button>
        </div>

        {/* Toggle de vistas */}
        <div style={{ display: 'flex', gap: 4, background: '#f0f0f0', padding: 3, borderRadius: 10 }}>
          <button
            type="button"
            onClick={() => setVista('grilla')}
            style={{
              border: 'none',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: vista === 'grilla' ? '#2d5a3d' : 'transparent',
              color: vista === 'grilla' ? '#fff' : '#555',
              transition: 'all 0.2s',
            }}
          >
            📅 Grilla
          </button>
          <button
            type="button"
            onClick={() => setVista('timeline')}
            style={{
              border: 'none',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: vista === 'timeline' ? '#2d5a3d' : 'transparent',
              color: vista === 'timeline' ? '#fff' : '#555',
              transition: 'all 0.2s',
            }}
          >
            📈 Timeline
          </button>
        </div>
      </div>

      <div style={{ ...s.controlsRow, gap: isMobile ? 6 : 8 }}>
        <div style={{ ...s.rightControls, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center' }}>
          <button
            type="button"
            style={{ ...s.importBtn, textAlign: 'center' }}
            onClick={abrirModalIcal}
            title="Configurar URLs de calendarios iCal"
          >
            📥 {isMobile ? 'Canales iCal' : 'Importar desde canales'}
          </button>
          <button
            type="button"
            style={{ ...s.secondaryActionBtn, opacity: syncing ? 0.6 : 1, textAlign: 'center' }}
            onClick={() => sincronizarTodo()}
            disabled={Boolean(syncing)}
            title="Volver a leer los calendarios iCal"
          >
            ↻ Sincronizar iCal
          </button>
          <select style={{ ...s.select, width: isMobile ? '100%' : 'auto' }} value={filtro} onChange={e => setFiltro(e.target.value)}>
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

      {/* Reporte detallado de importación iCal */}
      {syncReport && (
        <div style={{
          background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12,
          marginBottom: 16, overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          {/* Header del reporte */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', background: '#f8f9fa', borderBottom: '1px solid #e8e8e8',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>
                📥 Resultado importación {syncReport.canal}
              </span>
              <span style={{ fontSize: 12, color: '#888' }}>
                · {syncReport.total} evento(s) procesados
              </span>
            </div>
            <button onClick={() => setSyncReport(null)} style={{
              border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 16, color: '#aaa', padding: '0 4px',
            }}>✕</button>
          </div>

          {/* Resumen de contadores */}
          <div style={{
            display: 'flex', gap: 0, borderBottom: '1px solid #f0f0f0',
          }}>
            <div style={{
              flex: 1, padding: '12px 16px', borderRight: '1px solid #f0f0f0',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reservas nuevas</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: syncReport.totalReservas > 0 ? '#6B21A8' : '#ccc' }}>
                {syncReport.totalReservas}
              </span>
              <span style={{ fontSize: 11, color: '#6B21A8' }}>Pendiente · requieren cliente</span>
            </div>
            <div style={{
              flex: 1, padding: '12px 16px', borderRight: '1px solid #f0f0f0',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fechas bloqueadas</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#555' }}>
                {syncReport.totalBloqueadas}
              </span>
              <span style={{ fontSize: 11, color: '#888' }}>Cerrada · no aparecen en lista</span>
            </div>
            <div style={{
              flex: 1, padding: '12px 16px',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actualizadas</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#374151' }}>
                {syncReport.totalActualizadas}
              </span>
              <span style={{ fontSize: 11, color: '#888' }}>Sin cambios de estado</span>
            </div>
          </div>

          {/* Detalle por propiedad */}
          {syncReport.totalReabiertas > 0 && <div style={{ padding: '12px 16px', background: '#eaf5ef', color: '#285f42', fontSize: 13 }}>
            {syncReport.totalReabiertas} cierre(s) retirado(s) o acortado(s): las fechas reabiertas ya no están bloqueadas por este canal.
          </div>}
          {syncReport.propDetalles.map((pd, idx) => (
            <div key={idx} style={{ borderBottom: '1px solid #f5f5f5', padding: '12px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#444', marginBottom: 8 }}>
                🏠 {pd.nombre}
              </div>

              {/* Reservas reales nuevas */}
              {pd.reservasNuevas.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 600, color: '#6B21A8',
                    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4,
                  }}>
                    📌 Reservas nuevas — agregá el cliente
                  </div>
                  {pd.reservasNuevas.map((r, i) => {
                    const fmtD = (s) => { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}` }
                    const noches = Math.round((new Date(r.checkout) - new Date(r.checkin)) / 86400000)
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 10px', background: '#faf5ff',
                        border: '1px solid #e9d5ff', borderRadius: 6, marginBottom: 4,
                        fontSize: 12,
                      }}>
                        <span style={{ background: '#6B21A8', color: '#fff', padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600 }}>PENDIENTE</span>
                        <span style={{ fontWeight: 500 }}>{fmtD(r.checkin)} → {fmtD(r.checkout)}</span>
                        <span style={{ color: '#888' }}>{noches} noches</span>
                        {r.summary && r.summary.toUpperCase() !== 'CLOSED' && (
                          <span style={{ color: '#999', fontStyle: 'italic', marginLeft: 4 }}>{r.summary}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Fechas bloqueadas */}
              {pd.bloqueadasNuevas > 0 && (
                <div style={{ fontSize: 12, color: '#888' }}>
                  🔒 {pd.bloqueadasNuevas} fecha(s) bloqueada(s) nueva(s) — no aparecen como reservas
                </div>
              )}

              {/* Solo actualizaciones, nada nuevo */}
              {pd.reabiertas > 0 && <div style={{ fontSize: 12, color: '#285f42', marginBottom: 6 }}>{pd.reabiertas} cierre(s) retirado(s) o acortado(s)</div>}
              {pd.conservadas > 0 && <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>{pd.conservadas} reserva(s) ya gestionada(s), conservadas</div>}
              {pd.reservasNuevas.length === 0 && pd.bloqueadasNuevas === 0 && pd.actualizadas > 0 && (
                <div style={{ fontSize: 12, color: '#888' }}>
                  ✓ {pd.actualizadas} evento(s) ya existían, actualizados sin cambios
                </div>
              )}

              {pd.reservasNuevas.length === 0 && pd.bloqueadasNuevas === 0 && pd.actualizadas === 0 && !pd.reabiertas && !pd.conservadas && (
                <div style={{ fontSize: 12, color: '#bbb' }}>Sin novedades</div>
              )}
            </div>
          ))}

          {/* Conflictos */}
          {syncReport.conflictos.length > 0 && (
            <div style={{ padding: '10px 16px', background: '#FEF9C3', borderTop: '1px solid #FDE68A' }}>
              <span style={{ fontSize: 12, color: '#92400E', fontWeight: 600 }}>
                ⚠ {syncReport.conflictos.length} conflicto(s) omitido(s)
              </span>
              <span style={{ fontSize: 12, color: '#92400E', marginLeft: 4 }}>
                — fechas que se superponen con reservas gestionadas o de otro canal
              </span>
              {syncReport.conflictos.map((c, i) => <div key={i} style={{ marginTop: 8, fontSize: 12 }}>
                {c.propiedad} · {c.checkin.split('-').reverse().join('/')} → {c.checkout.split('-').reverse().join('/')}
                {c.reservas?.map(r => <div key={r.id}><Link to={`/admin?seccion=reservas&reserva_id=${r.id}`}>Ver reserva · {nombreCanal(r.canal)} · {r.estado}</Link></div>)}
              </div>)}
            </div>
          )}
        </div>
      )}



      {/* Leyenda de propiedades */}
      {propiedades.length > 0 && (
        <div style={{ ...s.legend, gap: isMobile ? 6 : 10 }}>
          {propiedades.map((p, i) => (
            <button
              key={p.id}
              style={{
                ...s.legendItem,
                fontSize: isMobile ? 11 : 13,
                padding: isMobile ? '3px 8px' : '4px 12px',
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

      {/* Grid del calendario / Timeline */}
      {error ? null : loading ? <div role="status" style={{ padding: '32px 16px', textAlign: 'center', color: '#555' }}>Cargando fechas…</div> : vista === 'timeline' ? (
        <TimelineView
          dias={diasMesActual}
          propiedades={propiedades}
          reservas={reservas}
          filtro={filtro}
          rangoInicio={rangoInicio}
          rangoFin={rangoFin}
          rangoPropId={rangoPropId}
          handleCellClick={handleCellClick}
          setDetalle={r => navigate(`/reservas/${r.id}`)}
          setDiaSeleccionado={setDiaSeleccionado}
          propColor={propColor}
          formatFecha={formatFecha}
        />
      ) : (
        <div style={s.calendarWrapper} data-testid="calendar-grid">
          {/* Encabezado días de semana */}
          <div style={s.gridHeader}>
            {(isMobile ? DIAS_CORTO : DIAS).map(d => (
              <div key={d} style={{ ...s.dayHeaderCell, fontSize: isMobile ? 10 : 12 }}>{d}</div>
            ))}
          </div>

          {/* Celdas */}
          <div style={s.grid}>
            {celdas.map(({ ds, actual, dia }) => {
              const dayRes = reservasDelDia(ds)
              const esHoy  = ds === hoyStr
              const diaPasado = actual && esDiaPasado(ds)

              // Lógica de selección de rango
              const isStart = ds === rangoInicio
              const isEnd = ds === rangoFin
              const isSelected = rangoInicio && rangoFin && ds > rangoInicio && ds < rangoFin
              const isSingleSelection = rangoInicio && !rangoFin && ds === rangoInicio

              // Colores de fondo de selección
              let bgSelection = ''
              let colorSelection = ''
              let borderRadiusSelection = ''
              
              if (isStart || isEnd || isSingleSelection) {
                bgSelection = '#2d5a3d'
                colorSelection = '#ffffff'
                if (isSingleSelection) {
                  borderRadiusSelection = '8px'
                } else if (isStart) {
                  borderRadiusSelection = '8px 0 0 8px'
                } else if (isEnd) {
                  borderRadiusSelection = '0 8px 8px 0'
                }
              } else if (isSelected) {
                bgSelection = '#E8F5EC'
                colorSelection = '#2d5a3d'
              }

              return (
                <div
                  key={ds}
                  onClick={() => handleCellClick(ds, filtro !== 'todas' ? filtro : null)}
                  style={{
                    ...s.cell,
                    minHeight: isMobile ? 52 : isTablet ? 70 : 90,
                    padding: isMobile ? '4px 3px' : isTablet ? '4px 6px' : '6px 8px',
                    background: bgSelection || (esHoy ? '#f0faf4' : diaPasado ? '#ECEFF1' : actual ? '#ffffff' : '#f8f8f8'),
                    cursor: 'pointer',
                    borderRadius: borderRadiusSelection,
                    transition: 'background-color 0.15s ease, border-radius 0.15s ease',
                    border: esHoy && !bgSelection ? '2px solid #2d5a3d' : (isSingleSelection || isStart || isEnd ? '1px solid #1a3c25' : undefined),
                    boxSizing: 'border-box',
                  }}
                >
                  {/* Número del día */}
                  <div style={{
                    ...s.dayNum,
                    ...(esHoy ? s.hoyNum : {}),
                    fontSize: isMobile ? 11 : isTablet ? 12 : 13,
                    width: isMobile ? 20 : isTablet ? 22 : 26,
                    height: isMobile ? 20 : isTablet ? 22 : 26,
                    color: colorSelection || (actual ? (esHoy ? '#fff' : diaPasado ? '#6B7280' : '#1a1a1a') : '#c0c0c0'),
                    backgroundColor: colorSelection ? 'transparent' : undefined,
                  }}>
                    {dia}
                  </div>

                  {/* Indicadores de bloqueo */}
                  {(() => {
                    const bsDelDia = bloqueosDelDia(ds)
                    if (bsDelDia.length === 0) return null
                    return (
                      <div
                        onClick={e => {
                          e.stopPropagation()
                          setBloqueoSeleccionado(bsDelDia[0])
                        }}
                        title={bsDelDia[0].motivo || 'Cerrado'}
                        style={{
                          fontSize: isMobile ? 8 : 10,
                          color: '#6B4C9E',
                          fontWeight: 600,
                          background: '#F3EEFF',
                          borderRadius: 4,
                          padding: isMobile ? '1px 3px' : '1px 5px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '100%',
                        }}
                      >
                        🔒 {isMobile ? '' : (bsDelDia[0].motivo || 'Cerrado')}
                      </div>
                    )
                  })()}

                  {/* En mobile: solo puntos de color. En tablet/desktop: barras con texto */}
                  {isMobile ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2 }}>
                      {dayRes.slice(0, 4).map(r => (
                        <button
                          key={r.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/reservas/${r.id}`)
                          }}
                          title={`${nombreReserva(r)} — ${r.propiedades?.nombre ?? ''}`}
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: esReservaPasada(r) ? '#6B7280' : propColor(r.propiedad_id),
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            flexShrink: 0,
                            opacity: esReservaPasada(r) ? 0.65 : 1,
                          }}
                        />
                      ))}
                      {dayRes.length > 4 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDiaSeleccionado({ ds, reservas: dayRes })
                          }}
                          style={{ fontSize: 8, color: '#2d5a3d', background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}
                        >
                          +{dayRes.length - 4}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={s.barsContainer}>
                      {dayRes.slice(0, isTablet ? 2 : 3).map(r => (
                        <button
                          key={r.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/reservas/${r.id}`)
                          }}
                          style={{
                            ...s.bar,
                            background: esReservaPasada(r) ? '#6B7280' : propColor(r.propiedad_id),
                            fontSize: isTablet ? 9.5 : 11,
                            padding: isTablet ? '1px 4px' : '2px 6px',
                            opacity: esReservaPasada(r) ? 0.72 : 1,
                          }}
                          title={`${nombreReserva(r)} — ${r.propiedades?.nombre}`}
                        >
                          {nombreCortoReserva(r)}
                        </button>
                      ))}
                      {dayRes.length > (isTablet ? 2 : 3) && (
                        <button
                          style={{
                            ...s.moreBadgeBtn,
                            fontSize: isTablet ? 10 : 11,
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setDiaSeleccionado({ ds, reservas: dayRes })
                          }}
                        >
                          +{dayRes.length - (isTablet ? 2 : 3)} {isTablet ? '' : 'más'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Resumen del mes */}
      {!loading && !error && <ResumenMes reservas={reservas.filter(r => r.checkin <= toStr(year, month + 1, ultimoDiaMes(year, month)) && r.checkout > toStr(year, month + 1, 1))} filtro={filtro} propiedades={propiedades} />}

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
            navigate(`/reservas/${r.id}`)
          }}
          propColor={propColor}
        />
      )}

      {/* Floating range selection action bar */}
      {rangoInicio && (
        <div style={{
          ...s.floatingBar,
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          textAlign: isMobile ? 'center' : 'left',
          gap: isMobile ? 12 : 20,
        }}>
          <div style={s.floatingBarText}>
            {rangoFin ? (
              <span>
                Seleccionado: <strong>{formatFecha(rangoInicio)}</strong> al <strong>{formatFecha(rangoFin)}</strong> ({diffNoches(rangoInicio, rangoFin)} noches)
              </span>
            ) : (
              <span>
                Seleccioná la fecha de salida (Check-out) para <strong>{formatFecha(rangoInicio)}</strong>
              </span>
            )}
          </div>
          <div style={{
            ...s.floatingBarActions,
            justifyContent: isMobile ? 'center' : 'flex-end',
            width: isMobile ? '100%' : 'auto',
          }}>
            {rangoFin && (
              <button style={s.btnPrincipal} onClick={handleCrearReserva}>
                ➕ Nueva Reserva
              </button>
            )}
            {rangoFin && (
              <button
                style={{ ...s.btnModificar, background: '#6B4C9E' }}
                onClick={handleCerrarNoches}
              >
                🔒 Cerrar noches
              </button>
            )}
            {rangoFin && reservasSolapadas.length > 0 && (
              <button style={s.btnModificar} onClick={handleVerModificarReservas}>
                ✏️ {reservasSolapadas.length === 1 ? 'Modificar Reserva' : `Ver Reservas (${reservasSolapadas.length})`}
              </button>
            )}
            <button style={s.btnCancelarRango} onClick={clearRango}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal bloqueo */}
      {modalBloqueo && (
        <ModalBloqueo
          propiedades={propiedades}
          propFiltro={rangoPropId || (filtro !== 'todas' ? filtro : null)}
          rangoInicio={rangoInicio}
          rangoFin={rangoFin}
          onGuardar={guardarBloqueo}
          onClose={() => setModalBloqueo(false)}
        />
      )}

      {/* Modal abrir bloqueo */}
      {bloqueoSeleccionado && (
        <ModalAbrirBloqueo
          bloqueo={bloqueoSeleccionado}
          propiedades={propiedades}
          onAbrir={() => abrirBloqueo(bloqueoSeleccionado.id)}
          onClose={() => setBloqueoSeleccionado(null)}
        />
      )}
    </div>
  )
}

function ModalIcal({ propiedades, draft, setDraft, onGuardar, onClose }) {
  const isMobile = useIsMobile()
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
    <div style={{ ...s.overlay, alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={onClose}>
      <div
        style={{
          ...s.modal,
          borderRadius: isMobile ? '16px 16px 0 0' : '16px',
          boxShadow: isMobile ? '0 -8px 40px rgba(0,0,0,0.18)' : '0 10px 40px rgba(0,0,0,0.2)',
          maxWidth: 620,
          maxHeight: isMobile ? '92dvh' : '90vh',
          display: 'flex',
          flexDirection: 'column'
        }}
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

function ModalBloqueo({ propiedades, propFiltro, rangoInicio, rangoFin, onGuardar, onClose }) {
  const isMobile = useIsMobile()
  const [propiedadId, setPropiedadId] = useState(propFiltro || '')
  const [motivo, setMotivo] = useState('Cierre manual')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!propiedadId) {
      setError('Seleccioná una propiedad.')
      return
    }
    setGuardando(true)
    const err = await onGuardar({ propiedadId, motivo })
    setGuardando(false)
    if (err) {
      setError(err.message || 'No se pudieron cerrar las noches.')
    }
  }

  const propiedad = propiedades.find(p => p.id === propiedadId)

  return (
    <div style={{ ...s.overlay, alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={onClose}>
      <form
        style={{
          ...s.modal,
          borderRadius: isMobile ? '16px 16px 0 0' : '16px',
          maxWidth: 460,
        }}
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ ...s.modalHeader, borderLeft: '4px solid #6B4C9E' }}>
          <div>
            <div style={s.modalNombre}>Cerrar noches</div>
            <div style={s.modalPropiedad}>
              {formatFecha(rangoInicio)} al {formatFecha(rangoFin)}
            </div>
          </div>
          <button style={s.closeBtn} onClick={onClose} type="button">✕</button>
        </div>

        <div style={s.modalBody}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={s.datoLabel}>Propiedad</div>
              <select
                style={s.inputEdit}
                value={propiedadId}
                onChange={e => setPropiedadId(e.target.value)}
              >
                <option value="">Seleccionar propiedad</option>
                {propiedades.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            {propiedad && (
              <div style={{ fontSize: 13, color: '#666' }}>
                Se va a guardar como reserva cerrada en {propiedad.nombre}.
              </div>
            )}

            <div>
              <div style={s.datoLabel}>Motivo</div>
              <input
                style={s.inputEdit}
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Ej: mantenimiento, uso familiar, cierre manual"
              />
            </div>

            {error && <div style={s.inlineError}>{error}</div>}
          </div>
        </div>

        <div style={s.modalFooter}>
          <button style={s.btnSecundario} onClick={onClose} type="button" disabled={guardando}>
            Cancelar
          </button>
          <button style={{ ...s.btnWA, background: '#6B4C9E' }} type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Cerrar noches'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ModalAbrirBloqueo({ bloqueo, propiedades, onAbrir, onClose }) {
  const isMobile = useIsMobile()
  const propiedad = propiedades.find(p => p.id === bloqueo.propiedad_id)

  return (
    <div style={{ ...s.overlay, alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={onClose}>
      <div
        style={{
          ...s.modal,
          borderRadius: isMobile ? '16px 16px 0 0' : '16px',
          maxWidth: 420,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ ...s.modalHeader, borderLeft: '4px solid #6B4C9E' }}>
          <div>
            <div style={s.modalNombre}>Bloqueo manual anterior</div>
            <div style={s.modalPropiedad}>{propiedad?.nombre || 'Propiedad'}</div>
          </div>
          <button style={s.closeBtn} onClick={onClose} type="button">✕</button>
        </div>
        <div style={s.modalBody}>
          <div style={s.modalGrid}>
            <DatoModal label="Desde" value={formatFecha(bloqueo.fecha_inicio)} />
            <DatoModal label="Hasta" value={formatFecha(bloqueo.fecha_fin)} />
          </div>
          {bloqueo.motivo && (
            <div style={s.notasBox}>
              <span style={s.notasLabel}>Motivo</span>
              {bloqueo.motivo}
            </div>
          )}
        </div>
        <div style={s.modalFooter}>
          <button style={s.btnSecundario} onClick={onClose} type="button">Cerrar</button>
          <button style={{ ...s.btnSecundario, borderColor: '#991B1B', color: '#991B1B' }} onClick={onAbrir} type="button">
            Abrir bloqueo viejo
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Componente Timeline Horizontal ───────────────────────────────────────────
function TimelineView({
  dias,
  propiedades,
  reservas,
  filtro,
  rangoInicio,
  rangoFin,
  rangoPropId,
  handleCellClick,
  setDetalle,
  setDiaSeleccionado,
  propColor,
  formatFecha,
}) {
  const device = useDeviceType()
  const isMobile = device === 'mobile'
  const totalDias = dias.length
  const scrollRef = useRef(null)
  const hoyDs = hoySrt()

  // Scroll to today on mount
  useEffect(() => {
    if (!scrollRef.current) return
    const hoyIdx = dias.findIndex(d => d.ds === hoyDs)
    if (hoyIdx === -1) return
    // Each column is 44px wide; first column (sticky) is 130px
    const colWidth = 44
    const stickyWidth = 130
    const todayOffset = stickyWidth + hoyIdx * colWidth
    const containerWidth = scrollRef.current.clientWidth
    const scrollTo = todayOffset - containerWidth / 2 + colWidth / 2
    scrollRef.current.scrollLeft = Math.max(0, scrollTo)
  }, [dias, hoyDs])

  // Filtrar propiedades a mostrar
  const propsVisibles = propiedades.filter(p => filtro === 'todas' || p.id === filtro)

  return (
    <div style={{
      borderRadius: 12,
      border: '1px solid #e8e8e8',
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      overflow: 'hidden',
      background: '#fff',
      marginBottom: 16,
    }}>
      {/* Contenedor scrolleable */}
      <div ref={scrollRef} style={{ overflowX: 'auto', width: '100%' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `130px repeat(${totalDias}, 44px)`,
          minWidth: 130 + totalDias * 44,
          background: '#e8e8e8',
          gap: '1px',
        }}>
          
          {/* Fila de cabecera: Esquina + Días del mes */}
          <div style={{
            background: '#f5f5f5',
            padding: '10px 8px',
            fontWeight: 600,
            fontSize: 11,
            color: '#666',
            display: 'flex',
            alignItems: 'center',
            position: 'sticky',
            left: 0,
            zIndex: 20,
            borderRight: '2px solid #ddd',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            Propiedad
          </div>
          {dias.map(day => {
            const esFinde = day.dow === 0 || day.dow === 6
            const esHoyTl = day.ds === hoyDs
            return (
              <div
                key={day.d}
                style={{
                  background: esHoyTl ? '#e8f5ec' : esFinde ? '#ececec' : '#f5f5f5',
                  padding: '8px 0',
                  textAlign: 'center',
                  fontWeight: esHoyTl ? 700 : 600,
                  fontSize: 10,
                  color: '#666',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  borderLeft: esHoyTl ? '2px solid #2d5a3d' : undefined,
                  borderRight: esHoyTl ? '2px solid #2d5a3d' : undefined,
                  borderTop: esHoyTl ? '2px solid #2d5a3d' : undefined,
                }}
              >
                <span style={{ fontSize: 12, color: esHoyTl ? '#2d5a3d' : '#1a1a1a', fontWeight: esHoyTl ? 800 : 600 }}>{day.d}</span>
                <span style={{ fontSize: 9, textTransform: 'uppercase', opacity: 0.7, color: esHoyTl ? '#2d5a3d' : undefined }}>
                  {DIAS_CORTO[day.dow]}
                </span>
              </div>
            )
          })}

          {/* Filas por Propiedad */}
          {propsVisibles.map((prop, propIdx) => {
            const rowGridIndex = propIdx + 2 // Cabecera es fila 1

            // Obtener reservas de esta propiedad
            const reservasProp = reservas.filter(
              r => r.propiedad_id === prop.id && r.estado !== 'cancelada'
            )

            return (
              <Fragment key={prop.id}>
                {/* Columna Sticky: Nombre de la propiedad */}
                <div style={{
                  gridColumn: 1,
                  gridRow: rowGridIndex,
                  background: '#ffffff',
                  padding: '12px 10px',
                  fontWeight: 600,
                  fontSize: 12,
                  color: '#333',
                  display: 'flex',
                  alignItems: 'center',
                  position: 'sticky',
                  left: 0,
                  zIndex: 10,
                  borderRight: '2px solid #ddd',
                  boxShadow: '4px 0 8px rgba(0,0,0,0.03)',
                  height: 52,
                  boxSizing: 'border-box',
                }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: propColor(prop.id),
                    marginRight: 6,
                    display: 'inline-block',
                  }} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {prop.nombre}
                  </span>
                </div>

                {/* Celdas de días (Fondo interactivo) */}
                {dias.map((day, dIdx) => {
                  const ds = day.ds
                  
                  // Lógica de selección de rango específica de la propiedad
                  const isStart = ds === rangoInicio && rangoPropId === prop.id
                  const isEnd = ds === rangoFin && rangoPropId === prop.id
                  const isSelected = rangoInicio && rangoFin && ds > rangoInicio && ds < rangoFin && rangoPropId === prop.id
                  const isSingleSelection = rangoInicio && !rangoFin && ds === rangoInicio && rangoPropId === prop.id

                  let bgCell = day.dow === 0 || day.dow === 6 ? '#fafafa' : '#ffffff'
                  let borderRadiusSelection = ''
                  
                  if (isStart || isEnd || isSingleSelection) {
                    bgCell = '#2d5a3d'
                    if (isSingleSelection) {
                      borderRadiusSelection = '8px'
                    } else if (isStart) {
                      borderRadiusSelection = '8px 0 0 8px'
                    } else if (isEnd) {
                      borderRadiusSelection = '0 8px 8px 0'
                    }
                  } else if (isSelected) {
                    bgCell = '#E8F5EC'
                  }

                  const esHoyCell = day.ds === hoyDs
                  const diaPasado = esDiaPasado(day.ds)
                  return (
                    <div
                      key={day.d}
                      onClick={() => handleCellClick(ds, prop.id)}
                      style={{
                        gridColumn: dIdx + 2,
                        gridRow: rowGridIndex,
                        background: (isStart || isEnd || isSingleSelection) ? '#2d5a3d' : isSelected ? '#E8F5EC' : esHoyCell ? '#f0faf4' : diaPasado ? '#ECEFF1' : bgCell,
                        cursor: 'pointer',
                        borderRadius: borderRadiusSelection,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: 52,
                        boxSizing: 'border-box',
                        position: 'relative',
                        borderBottom: '1px solid #e8e8e8',
                        borderLeft: esHoyCell ? '2px solid #2d5a3d' : undefined,
                        borderRight: esHoyCell ? '2px solid #2d5a3d' : undefined,
                      }}
                    />
                  )
                })}

                {/* Reservas superpuestas */}
                {reservasProp.map(r => {
                  const checkinStr = r.checkin
                  const checkoutStr = r.checkout

                  // Si la reserva está fuera del mes visible, no la renderizamos
                  const firstDayStr = dias[0].ds
                  const lastDayStr = dias[dias.length - 1].ds
                  if (checkoutStr < firstDayStr || checkinStr > lastDayStr) {
                    return null
                  }

                  // Mapear check-in a columna
                  let startCol = 2
                  if (checkinStr >= firstDayStr) {
                    const dayNum = Number(checkinStr.split('-')[2])
                    startCol = dayNum + 1 // +1 por columna de prop (1)
                  }

                  // Mapear check-out a columna
                  let endCol = totalDias + 2
                  if (checkoutStr <= lastDayStr) {
                    const dayNum = Number(checkoutStr.split('-')[2])
                    endCol = dayNum + 1
                  }

                  // Validar rango
                  if (startCol >= endCol) return null

                  return (
                    <button
                      key={r.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDetalle(r)
                      }}
                      style={{
                        gridColumnStart: startCol,
                        gridColumnEnd: endCol,
                        gridRow: rowGridIndex,
                        margin: '6px 2px',
                        padding: '4px 8px',
                        background: esReservaPasada(r) ? '#6B7280' : propColor(r.propiedad_id),
                        border: 'none',
                        borderRadius: 6,
                        color: '#ffffff',
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: 'pointer',
                        zIndex: 5,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.12)',
                        height: 38,
                        alignSelf: 'center',
                        opacity: esReservaPasada(r) ? 0.72 : 1,
                      }}
                      title={`${nombreReserva(r)} — ${r.propiedades?.nombre} (${formatFecha(r.checkin)} al ${formatFecha(r.checkout)})`}
                    >
                      {nombreCortoReserva(r)}
                    </button>
                  )
                })}
              </Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Resumen del mes ──────────────────────────────────────────────────────────
function ResumenMes({ reservas, filtro, propiedades }) {
  const filtradas = filtro === 'todas'
    ? reservas.filter(r => r.estado !== 'cerrada' && r.estado !== 'cancelada')
    : reservas.filter(r => r.propiedad_id === filtro && r.estado !== 'cerrada' && r.estado !== 'cancelada')

  if (filtradas.length === 0) return null

  const pendientes = filtradas.filter(r => r.estado === 'pendiente').length

  return (
    <div style={s.resumen}>
      <div style={s.resumenItem}>
        <span style={s.resumenLabel}>Reservas del mes</span>
        <span style={s.resumenValor}>{filtradas.length}</span>
      </div>
      {pendientes > 0 && (
        <div style={s.resumenItem}>
          <span style={s.resumenLabel}>Pendientes de confirmar</span>
          <span style={{ ...s.resumenValor, color: '#92400E' }}>{pendientes}</span>
        </div>
      )}
    </div>
  )
}

// ─── Modal de detalle de reserva ──────────────────────────────────────────────
function ModalDetalle({ reserva: r, color, onClose, onActualizar }) {
  const isMobile = useIsMobile()
  const [cambiandoEstado, setCambiandoEstado] = useState(false)
  const [editando,        setEditando]        = useState(false)
  const [guardando,       setGuardando]       = useState(false)
  const [saveError,       setSaveError]       = useState('')
  const [confirmarAbrir,  setConfirmarAbrir]  = useState(false)
  const [form, setForm] = useState({
    checkin:      r.checkin,
    checkout:     r.checkout,
    precio_total: r.precio_total ?? '',
    adultos:      r.adultos ?? 1,
    menores:      r.menores ?? 0,
    notas_internas: r.notas_internas ?? '',
  })

  const estadoVisual = estadoVisualReserva(r)
  const estadoInfo = ESTADO_LABEL[estadoVisual] ?? { label: r.estado, bg: '#f0f0f0', color: '#333' }
  const tituloReserva = nombreReserva(r)
  const cierreManual = esCierreManual(r)
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

    const { data: bloqueadas, error: bloqueoError } = await supabase
      .from('bloqueos')
      .select('id, fecha_inicio, fecha_fin, motivo')
      .eq('propiedad_id', r.propiedad_id)
      .lt('fecha_inicio', form.checkout)
      .gt('fecha_fin', form.checkin)

    if (bloqueoError) {
      setGuardando(false)
      setSaveError(bloqueoError.message || 'No se pudieron validar los bloqueos manuales.')
      return
    }

    if ((bloqueadas ?? []).length > 0) {
      setGuardando(false)
      setSaveError('Ese rango se superpone con noches cerradas manualmente.')
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

  async function abrirCierreManual() {
    if (!cierreManual) return

    setConfirmarAbrir(false)
    setSaveError('')
    setGuardando(true)
    const { error } = await supabase
      .from('reservas')
      .delete()
      .eq('id', r.id)
      .eq('estado', 'cerrada')
      .in('canal_origen', ['directo', 'manual'])

    if (error) {
      setGuardando(false)
      setSaveError(error.message || 'No se pudo abrir el cierre manual.')
      return
    }

    await onActualizar()
    setGuardando(false)
    onClose()
  }

  return (
    <>
    <div style={{ ...s.overlay, alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={onClose}>
      <div
        style={{
          ...s.modal,
          borderRadius: isMobile ? '16px 16px 0 0' : '16px',
          boxShadow: isMobile ? '0 -8px 40px rgba(0,0,0,0.18)' : '0 10px 40px rgba(0,0,0,0.2)',
          maxHeight: isMobile ? '92dvh' : '90vh',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* Encabezado */}
        <div style={{ ...s.modalHeader, borderLeft: `4px solid ${color}`, flexShrink: 0 }}>
          <div>
            <div style={s.modalNombre}>
              {tituloReserva}
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
                {r.estado === 'cerrada' && <DatoModal label="Tipo de cierre" value={tipoCierreReserva(r)} highlight />}
                <DatoModal label="Canal" value={nombreCanal(r.canal_origen)} />
              </div>

              {r.notas_internas && (
                <div style={s.notasBox}>
                  <span style={s.notasLabel}>Notas</span>
                  {r.notas_internas}
                </div>
              )}

              {saveError && (
                <div style={s.inlineError}>
                  {saveError}
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

          {/* Cambiar estado: solo visible cuando se está editando */}
          {editando && (
            <div style={{ ...s.estadosSection, marginTop: 16 }}>
              <div style={s.estadosLabel}>Cambiar estado</div>
              <div style={s.estadosBtns}>
                {ESTADOS_EDITABLES.map((key) => {
                  const val = ESTADO_LABEL[key]
                  const isCurrent = r.estado === key
                  return (
                    <button
                      key={key}
                      disabled={isCurrent || cambiandoEstado || guardando}
                      onClick={() => cambiarEstado(key)}
                      style={{
                        ...s.estadoBtn,
                        background: val.bg,
                        color:      val.color,
                        opacity:    isCurrent ? 1 : 0.7,
                        fontWeight: isCurrent ? 600 : 400,
                        cursor:     isCurrent ? 'default' : 'pointer',
                      }}
                    >
                      {val.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {r.estado === 'cerrada' && !editando && <div style={{ padding: '12px 20px' }}>
          <Link style={{ ...s.btnWA, display: 'inline-flex', alignItems: 'center', minHeight: 44 }} to={`/admin?seccion=reservas&reserva_id=${r.id}&accion=asignar-inquilino`}>Asignar inquilino</Link>
        </div>}
        {r.estado !== 'cerrada' && !editando && <div style={{ padding: '12px 20px' }}>
          <Link to={`/cobros?reserva_id=${r.id}`}>Ver señas y cobros</Link>
        </div>}
        <div style={{ ...s.modalFooter, flexShrink: 0, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {waLink && (
              <a href={waLink} target="_blank" rel="noreferrer" style={s.btnWA}>
                WhatsApp
              </a>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
                {cierreManual && (
                  <button
                    style={{ ...s.btnSecundario, borderColor: '#B91C1C', color: '#B91C1C', opacity: guardando ? 0.7 : 1 }}
                    onClick={() => setConfirmarAbrir(true)}
                    disabled={guardando}
                  >
                    {guardando ? 'Abriendo…' : 'Abrir cierre manual'}
                  </button>
                )}
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
    {confirmarAbrir && (
      <ConfirmDialog
        title="Abrir cierre manual"
        body="Se va a eliminar solamente este cierre creado en la app. Las reservas reales y los cierres importados no se tocan."
        confirmLabel="Abrir cierre"
        cancelLabel="Cancelar"
        danger
        onConfirm={abrirCierreManual}
        onCancel={() => setConfirmarAbrir(false)}
      />
    )}
    </>
  )
}

function ConfirmDialog({ title, body, confirmLabel, cancelLabel, danger = false, onConfirm, onCancel }) {
  const isMobile = useIsMobile()

  return (
    <div
      style={{
        ...s.overlay,
        zIndex: 2000,
        alignItems: isMobile ? 'flex-end' : 'center',
        padding: isMobile ? 0 : 20,
        background: 'rgba(0,0,0,0.42)',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          ...s.modal,
          maxWidth: 420,
          borderRadius: isMobile ? '16px 16px 0 0' : 16,
          boxShadow: isMobile ? '0 -8px 40px rgba(0,0,0,0.18)' : '0 14px 45px rgba(0,0,0,0.2)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ ...s.modalHeader, borderLeft: `4px solid ${danger ? '#B91C1C' : '#2d5a3d'}` }}>
          <div>
            <div style={s.modalNombre}>{title}</div>
            <div style={s.modalPropiedad}>Confirmar acción</div>
          </div>
          <button style={s.closeBtn} onClick={onCancel} type="button">✕</button>
        </div>
        <div style={s.modalBody}>
          <p style={{ margin: 0, color: '#555', fontSize: 14, lineHeight: 1.5 }}>
            {body}
          </p>
        </div>
        <div style={s.modalFooter}>
          <button style={s.btnSecundario} onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button
            style={{
              ...s.btnWA,
              background: danger ? '#B91C1C' : '#2d5a3d',
            }}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
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
  const isMobile = useIsMobile()
  
  const title = useMemo(() => {
    if (dia.ds.includes(' al ')) {
      const [start, end] = dia.ds.split(' al ')
      const format = (str) => {
        const [y, m, d] = str.split('-')
        return `${d}/${m}/${y}`
      }
      return `Reservas del ${format(start)} al ${format(end)}`
    } else {
      const [y, m, d] = dia.ds.split('-')
      return `Reservas del ${d}/${m}/${y}`
    }
  }, [dia.ds])
  
  return (
    <div style={{ ...s.overlay, alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={onClose}>
      <div
        style={{
          ...s.modal,
          borderRadius: isMobile ? '16px 16px 0 0' : '16px',
          boxShadow: isMobile ? '0 -8px 40px rgba(0,0,0,0.18)' : '0 10px 40px rgba(0,0,0,0.2)',
          maxWidth: 500,
          maxHeight: isMobile ? '92dvh' : '90dvh'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ ...s.modalHeader, borderLeft: '4px solid #2d5a3d' }}>
          <div>
            <div style={s.modalNombre}>{title}</div>
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
                  {nombreReserva(r)}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {r.propiedades?.nombre}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>
                {r.estado === 'cerrada' ? tipoCierreReserva(r) : (ESTADO_LABEL[estadoVisualReserva(r)]?.label || r.estado)}
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
  page:          { maxWidth: 1000, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' },
  topBar:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 },
  controlsRow:   { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginBottom: 16 },
  navGroup:      { display: 'flex', alignItems: 'center', gap: 8 },
  navBtn:        { padding: '6px 14px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 18, fontWeight: 500, lineHeight: 1 },
  monthTitle:    { fontWeight: 600, textAlign: 'center', letterSpacing: '-0.02em' },
  rightControls: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%' },
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
  legendItem: { display: 'flex', alignItems: 'center', gap: 6, color: '#444', background: 'none', border: '1px solid #e8e8e8', borderRadius: 20, cursor: 'pointer', transition: 'opacity .2s' },
  dot:        { width: 10, height: 10, borderRadius: 3, flexShrink: 0 },

  calendarWrapper: { borderRadius: 12, overflow: 'hidden', border: '1px solid #e8e8e8', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  gridHeader:      { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f5f5f5' },
  dayHeaderCell:   { padding: '8px 0', textAlign: 'center', fontWeight: 600, color: '#666', letterSpacing: '0.05em', textTransform: 'uppercase' },

  grid:          { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: '#e8e8e8' },
  cell:          { padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 },
  dayNum:        { display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', marginBottom: 2, flexShrink: 0 },
  hoyNum:        { background: '#2d5a3d', color: '#fff', fontWeight: 700 },

  barsContainer: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },
  bar:           { fontSize: 11, color: '#fff', padding: '2px 6px', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500, border: 'none', textAlign: 'left', width: '100%' },

  resumen:      { display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' },
  resumenItem:  { display: 'flex', flexDirection: 'column', gap: 2 },
  resumenLabel: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' },
  resumenValor: { fontSize: 20, fontWeight: 600, color: '#1a1a1a' },

  overlay:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000, padding: 0 },
  modal:        { background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480, boxShadow: '0 -8px 40px rgba(0,0,0,0.18)', overflow: 'hidden', maxHeight: '92dvh' },

  modalHeader:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 20px 0' },
  modalNombre:      { fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' },
  modalPropiedad:   { fontSize: 13, color: '#888', marginTop: 2 },
  modalHeaderRight: { display: 'flex', alignItems: 'center', gap: 10 },
  estadoBadge:      { fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 600 },
  closeBtn:         { border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: '#bbb', padding: 0, lineHeight: 1 },

  modalBody:    { padding: '16px 20px' },
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

  modalFooter:   { display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 20px', borderTop: '1px solid #f0f0f0' },
  btnWA:         { padding: '8px 18px', borderRadius: 8, background: '#25D366', color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 500 },
  btnSecundario: { padding: '8px 18px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 14 },

  floatingBar: {
    position: 'fixed',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(26, 26, 26, 0.95)',
    color: '#fff',
    padding: '12px 24px',
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 900,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.24)',
    width: 'calc(100% - 32px)',
    maxWidth: 700,
    boxSizing: 'border-box',
    backdropFilter: 'blur(8px)',
  },
  floatingBarText: {
    fontSize: 14,
    fontWeight: 500,
  },
  floatingBarActions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  btnPrincipal: {
    background: '#2d5a3d',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnModificar: {
    background: '#E07B39',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnCancelarRango: {
    background: 'transparent',
    color: '#ccc',
    border: 'none',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
}
