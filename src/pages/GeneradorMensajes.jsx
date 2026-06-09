import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ─── Utilidades ───────────────────────────────────────────────────────────────
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function fmtFecha(str) {
  if (!str) return '[fecha]'
  const [y, m, d] = str.split('-')
  return `${parseInt(d)} de ${MESES[parseInt(m) - 1]} de ${y}`
}

function fmt(n) {
  return '$' + Number(n).toLocaleString('es-AR')
}

function calcNoches(desde, hasta) {
  if (!desde || !hasta) return 0
  const [y1, m1, d1] = desde.split('-').map(Number)
  const [y2, m2, d2] = hasta.split('-').map(Number)
  return Math.max(0, Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000))
}

const SEP = '━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'

// ─── Generadores de texto ─────────────────────────────────────────────────────
function genCotizacion(p, { cotDesde, cotHasta, cotPxn, cotPersonas }) {
  const n     = calcNoches(cotDesde, cotHasta)
  const pxn   = Number(cotPxn || 0)
  const total = n * pxn
  const sena  = Math.round(total * 0.3)
  const esDN  = !p.marca
  const firmaWeb = esDP(esDN)

  const distSec = p.distribucion ? '\nDistribución:\n' + p.distribucion + '\n' : ''
  const webSec  = p.link_web ? '\nVer fotos: ' + p.link_web + '\n' : ''

  return '¡Hola!\n\n'
    + 'Te paso la información del ' + p.nombre + ':\n\n'
    + SEP + 'DEPARTAMENTO\n' + SEP
    + 'Dirección: ' + (p.ubicacion || p.direccion || '') + '\n'
    + 'Capacidad: ' + (p.capacidad_desc || `hasta ${p.capacidad_max || '?'} personas`) + '\n'
    + distSec
    + '\nEquipamiento:\n' + (p.equipamiento || '') + '\n'
    + webSec
    + '\n' + SEP + 'COTIZACIÓN\n' + SEP
    + (cotDesde ? `  • Fechas: ${fmtFecha(cotDesde)} al ${fmtFecha(cotHasta)}\n` : '')
    + (cotPersonas ? `  • Personas: ${cotPersonas}\n` : '')
    + (n > 0 ? `  • Noches: ${n}\n` : '')
    + (pxn > 0 ? `  • Precio por noche: ${fmt(pxn)}\n` : '')
    + (total > 0
      ? `  • Total: ${fmt(total)}\n  • Seña para confirmar (30%): ${fmt(sena)}\n  • Saldo al ingresar: ${fmt(total - sena)}\n`
      : '')
    + '\nSi estás interesado/a, te mando el formulario para completar y continuar con la reserva.\n\n'
    + 'Cualquier consulta, quedo a disposición.\n\n'
    + 'Saludos,\nMatías\n📞 +54 9 2255-536640' + firmaWeb
}

function genFicha(p) {
  const acomp     = p.acompanantes ?? Math.max(1, (p.capacidad_max ?? 2) - 1)
  const label     = acomp === 1 ? 'Acompañante' : 'Acompañantes'
  const lines     = Array.from({ length: acomp }, (_, i) => `  ${i + 1}.\n`).join('')
  const vehiculo  = p.restriccion_vehiculos ? '  • Vehículos: No está permitido ingresar vehículos (motos, cuatriciclos, etc.) al predio.\n' : ''
  const intro     = p.intro_personalizado ?? 'Gracias por reservar en Departamentos Norte. A continuación te envío los datos para continuar:'
  const esPN      = !p.marca
  const firmaWeb  = esDP(esPN)
  // const webSec   = p.link_web ? 'Ver fotos: ' + p.link_web + '\n' : ''

  return `Asunto: Confirmación de Reserva – ${p.nombre}\n\n¡Hola!\n\n${intro}\n\n`
    + SEP + 'POLÍTICAS DE PAGO\n' + SEP
    + '  • Método de pago: Transferencia bancaria.\n'
    + '  • Reserva: Depósito del 30% dentro de las 48 hs de recibir los datos bancarios. Pasado ese plazo, la reserva puede ser cancelada.\n'
    + '  • Saldo restante: 70% en efectivo al momento del check-in.\n'
    + '  • Confirmación: Una vez recibido el formulario, te enviamos los datos bancarios.\n\n'
    + SEP + 'FORMULARIO DE INSCRIPCIÓN\n' + SEP
    + 'Por favor, completá los datos y envíalos por WhatsApp al +54 9 2255-536640:\n\n'
    + 'Datos del titular:\n'
    + '  • Nombre y apellido:\n  • DNI:\n  • Dirección:\n  • Localidad:\n  • Teléfono celular:\n  • Correo electrónico:\n\n'
    + `${label} (Nombre, Apellido y DNI):\n${lines}\n`
    + SEP + 'POLÍTICAS ADICIONALES\n' + SEP
    + '  • Solo familias: No se aceptan grupos de jóvenes.\n'
    + '  • Ropa blanca: No se incluyen sábanas ni toallas.\n'
    + '  • No se permiten fiestas ni eventos.\n'
    + vehiculo
    // + webSec
    + '\nCualquier duda o consulta, quedo a tu disposición.\n\n'
    + 'Saludos cordiales,\nMatías\n📞 +54 9 2255-536640' + firmaWeb
}

function genDetalle(p, { detCheckin, detCheckout, detTotal }) {
  const n      = calcNoches(detCheckin, detCheckout)
  const tot    = Number(detTotal || 0)
  const sena   = Math.round(tot * 0.3)
  const saldo  = tot - sena
  const marca  = p.marca || 'Departamentos Norte'
  const esPN   = !p.marca
  const fw     = esDP(esPN)
  const veh    = p.restriccion_vehiculos ? '  • No está permitido ingresar vehículos al predio (motos, cuatriciclos, etc.).\n' : ''
  const alias  = p.alias_cbu || 'maratano.mp'

  return `Detalle de su reserva – ${marca}\n\n¡Hola!\n\n`
    + `Gracias por reservar en ${marca}. Leé atentamente la información de tu reserva:\n\n`
    + SEP + 'DETALLES DE LA RESERVA\n' + SEP
    + `  • Departamento: ${p.nombre}\n`
    + `  • Check-in: ${fmtFecha(detCheckin)} a partir de las 14:00 hs.\n`
    + `  • Check-out: ${fmtFecha(detCheckout)} hasta las 10:00 hs.\n`
    + `  • Duración: ${n} noches\n`
    + `  • Costo total: ${fmt(tot)}\n`
    + `  • Seña para confirmar (30%): ${fmt(sena)}\n`
    + `    ↳ Este depósito debe realizarse dentro de las 48 hs de recibir los datos bancarios. Pasado ese plazo, la reserva puede cancelarse.\n`
    + `  • Saldo a pagar al ingresar: ${fmt(saldo)}\n\n`
    + SEP + 'POLÍTICAS Y CONDICIONES\n' + SEP
    + '  • No incluye ropa blanca (sábanas ni toallas).\n'
    + '  • Solo para familias (no se permiten grupos de jóvenes).\n'
    + '  • No está permitido realizar fiestas ni eventos.\n'
    + veh
    + '  • La reserva se confirma únicamente tras recibir el depósito del 30%.\n\n'
    + SEP + 'MÉTODO DE PAGO\n' + SEP
    + 'Transferencia bancaria o Mercado Pago.\n'
    + 'Cuenta a nombre de Matías Nicolás Aratano:\n'
    + '  • CVU: 0000003100056995782339\n'
    + `  • Alias: ${alias}\n`
    + '  • CUIT/CUIL: 23-35727388-9\n\n'
    + 'Por favor, enviá el comprobante al WhatsApp una vez realizado el pago.\n\n'
    + 'Muchas gracias por elegirnos. Quedamos a disposición.\n\n'
    + 'Saludos cordiales,\nMatías\n📞 +54 9 2255-536640' + fw
}

function genNoDisponible(p, { ndDesde, ndHasta }) {
  const fechas = (ndDesde && ndHasta)
    ? `del ${fmtFecha(ndDesde)} al ${fmtFecha(ndHasta)}`
    : 'para las fechas consultadas'
  const fw = esDP(!p.marca)

  return `¡Hola!\n\nGracias por tu consulta.\n\n`
    + `Lamentablemente el ${p.nombre} no tiene disponibilidad ${fechas}.\n\n`
    + '¿Tenés flexibilidad? Con gusto te consulto disponibilidad para otra fecha.\n\n'
    + 'Saludos,\nMatías\n📞 +54 9 2255-536640' + fw
}

function genDerivacion() {
  const textoWA = 'Hola! Quiero consultar disponibilidad:\n- Cantidad de personas:\n- Fecha desde:\n- Fecha hasta:'
  const link = 'https://wa.me/5492255536640?text=' + encodeURIComponent(textoWA)
  return { texto: `Hola! Gracias por contactarte con Departamentos Norte 😊\n\nPara consultar disponibilidad, tarifas y recibir una respuesta más rápida, escribinos por WhatsApp:\n\n📲 ${link}\n\nO bien guardá el número +54 9 2255-536640 y escribime directamente.\n\nTe esperamos!\n`, link }
}

function esDP(bool) {
  return bool ? '\n🌐 https://www.departamentosnorte.com.ar' : ''
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function GeneradorMensajes() {
  const [tab,        setTabState]  = useState('cotizacion')
  const [props,      setProps]     = useState([])
  const [propId,     setPropId]    = useState('')
  const [resultado,  setResultado] = useState('')
  const [waLink,     setWaLink]    = useState('')
  const [toast,      setToast]     = useState('')

  // Cotización
  const [cotDesde,   setCotDesde]   = useState('')
  const [cotHasta,   setCotHasta]   = useState('')
  const [cotPxn,     setCotPxn]     = useState('')
  const [cotPersonas,setCotPersonas]= useState('')

  // Detalle
  const [detCheckin, setDetCheckin] = useState('')
  const [detCheckout,setDetCheckout]= useState('')
  const [detTotal,   setDetTotal]   = useState('')

  // No disponible
  const [ndDesde, setNdDesde] = useState('')
  const [ndHasta, setNdHasta] = useState('')

  useEffect(() => {
    supabase.from('propiedades').select('*').eq('activa', true).order('nombre')
      .then(({ data }) => {
        setProps(data ?? [])
        if (data?.length > 0) setPropId(data[0].id)
      })
  }, [])

  const propiedad = props.find(p => p.id === propId) ?? null

  // Resumen cotización
  const cotN     = calcNoches(cotDesde, cotHasta)
  const cotTotal = cotN * Number(cotPxn || 0)
  const cotSena  = Math.round(cotTotal * 0.3)

  // Resumen detalle
  const detN     = calcNoches(detCheckin, detCheckout)
  const detTot   = Number(detTotal || 0)
  const detSena  = Math.round(detTot * 0.3)
  const detSaldo = detTot - detSena

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  function cambiarTab(t) {
    setTabState(t)
    setResultado('')
    setWaLink('')
  }

  function generar() {
    if (tab !== 'derivacion' && !propiedad) {
      showToast('Seleccioná una propiedad')
      return
    }
    let txt = ''
    if (tab === 'cotizacion') {
      txt = genCotizacion(propiedad, { cotDesde, cotHasta, cotPxn, cotPersonas })
    } else if (tab === 'ficha') {
      txt = genFicha(propiedad)
    } else if (tab === 'detalle') {
      txt = genDetalle(propiedad, { detCheckin, detCheckout, detTotal })
    } else if (tab === 'nodisponible') {
      txt = genNoDisponible(propiedad, { ndDesde, ndHasta })
    } else if (tab === 'derivacion') {
      const r = genDerivacion()
      txt = r.texto
      setWaLink(r.link)
    }
    setResultado(txt)
  }

  function copiar() {
    if (!resultado.trim()) { showToast('Generá una plantilla primero'); return }
    navigator.clipboard.writeText(resultado).then(() => showToast('¡Copiado!'))
  }

  function abrirWA() {
    if (!resultado.trim()) { showToast('Generá una plantilla primero'); return }
    window.open('https://wa.me/?text=' + encodeURIComponent(resultado))
  }

  const mostrarDepto = tab !== 'derivacion'

  return (
    <div style={s.page}>
      {/* Header */}
      <header style={s.header}>
        <h1 style={s.h1}>Departamentos Norte</h1>
        <span style={s.headerSub}>Generador de plantillas</span>
      </header>

      {/* Tabs */}
      <div style={s.card}>
        <div style={s.cardLabel}>Tipo de mensaje</div>
        <div style={s.tabs}>
          {[
            { id: 'cotizacion',   label: '💬 Cotización' },
            { id: 'ficha',        label: '📄 Ficha' },
            { id: 'detalle',      label: '💰 Detalle' },
            { id: 'nodisponible', label: '❌ Sin disp.' },
            { id: 'derivacion',   label: '↗ Derivación' },
          ].map(t => (
            <button
              key={t.id}
              style={{ ...s.tab, ...(tab === t.id ? s.tabActive : {}) }}
              onClick={() => cambiarTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Selector de propiedad */}
        {mostrarDepto && (
          <>
            <div style={s.cardLabel}>Departamento</div>
            <div style={s.selectWrap}>
              <select style={s.select} value={propId} onChange={e => setPropId(e.target.value)}>
                {props.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <span style={s.selectArrow}>▾</span>
            </div>
          </>
        )}
      </div>

      {/* ── Inputs Cotización ── */}
      {tab === 'cotizacion' && (
        <div style={s.card}>
          <div style={s.cardLabel}>Datos para cotización</div>
          <div style={s.row2}>
            <Campo label="Fecha desde">
              <input type="date" style={s.input} value={cotDesde} onChange={e => setCotDesde(e.target.value)} />
            </Campo>
            <Campo label="Fecha hasta">
              <input type="date" style={s.input} value={cotHasta} onChange={e => setCotHasta(e.target.value)} />
            </Campo>
          </div>
          <div style={{ ...s.row2, marginTop: 10 }}>
            <Campo label="Precio por noche ($)">
              <input type="number" style={s.input} placeholder="0" value={cotPxn} onChange={e => setCotPxn(e.target.value)} />
            </Campo>
            <Campo label="Personas">
              <input type="number" style={s.input} placeholder="2" min={1} max={20} value={cotPersonas} onChange={e => setCotPersonas(e.target.value)} />
            </Campo>
          </div>
          {(cotN > 0 || cotTotal > 0) && (
            <div style={s.summary}>
              <SItem label="Noches" val={cotN || '–'} />
              <SItem label="Total" val={cotTotal ? fmt(cotTotal) : '–'} />
              <SItem label="Seña 30%" val={cotTotal ? fmt(cotSena) : '–'} />
            </div>
          )}
        </div>
      )}

      {/* ── Inputs Detalle ── */}
      {tab === 'detalle' && (
        <div style={s.card}>
          <div style={s.cardLabel}>Datos de la reserva</div>
          <div style={s.row2}>
            <Campo label="Check-in">
              <input type="date" style={s.input} value={detCheckin} onChange={e => setDetCheckin(e.target.value)} />
            </Campo>
            <Campo label="Check-out">
              <input type="date" style={s.input} value={detCheckout} onChange={e => setDetCheckout(e.target.value)} />
            </Campo>
          </div>
          <div style={{ marginTop: 10 }}>
            <Campo label="Costo total ($)">
              <input type="number" style={s.input} placeholder="0" value={detTotal} onChange={e => setDetTotal(e.target.value)} />
            </Campo>
          </div>
          {(detN > 0 || detTot > 0) && (
            <div style={s.summary}>
              <SItem label="Noches" val={detN || '–'} />
              <SItem label="Total" val={detTot ? fmt(detTot) : '–'} />
              <SItem label="Seña 30%" val={detTot ? fmt(detSena) : '–'} />
              <SItem label="Saldo" val={detTot ? fmt(detSaldo) : '–'} />
            </div>
          )}
        </div>
      )}

      {/* ── Inputs Sin disponibilidad ── */}
      {tab === 'nodisponible' && (
        <div style={s.card}>
          <div style={s.cardLabel}>Fechas solicitadas</div>
          <div style={s.row2}>
            <Campo label="Desde">
              <input type="date" style={s.input} value={ndDesde} onChange={e => setNdDesde(e.target.value)} />
            </Campo>
            <Campo label="Hasta">
              <input type="date" style={s.input} value={ndHasta} onChange={e => setNdHasta(e.target.value)} />
            </Campo>
          </div>
        </div>
      )}

      {/* ── Info Derivación ── */}
      {tab === 'derivacion' && (
        <div style={s.card}>
          <div style={s.infoBox}>
            Genera el link de WhatsApp con el texto prellenado para que el cliente complete fechas y cantidad de personas. Copialo para Instagram o email.
          </div>
        </div>
      )}

      {/* Botón generar */}
      <button style={s.btnPrimary} onClick={generar}>✦ Generar plantilla</button>

      {/* Resultado */}
      <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
        <textarea
          style={s.textarea}
          value={resultado}
          onChange={e => setResultado(e.target.value)}
          placeholder="La plantilla generada aparecerá aquí…"
        />
      </div>

      {/* Botones de acción */}
      {tab !== 'derivacion' ? (
        <div style={s.btnRow}>
          <button style={s.btnSecondary} onClick={copiar}>📋 Copiar texto</button>
          <button style={{ ...s.btnSecondary, ...s.btnWA }} onClick={abrirWA}>📲 WhatsApp</button>
          <div />
        </div>
      ) : (
        <div style={s.btnRow}>
          <button style={s.btnSecondary} onClick={() => {
            if (!waLink) { showToast('Generá la plantilla primero'); return }
            navigator.clipboard.writeText(waLink).then(() => showToast('Link copiado!'))
          }}>🔗 Copiar link</button>
          <button style={{ ...s.btnSecondary, ...s.btnWA }} onClick={() => { if (waLink) window.open(waLink) }}>📲 Abrir link</button>
          <button style={s.btnSecondary} onClick={copiar}>📋 Copiar texto</button>
        </div>
      )}

      {/* Toast */}
      <div style={{ ...s.toast, ...(toast ? s.toastShow : {}) }}>{toast}</div>
    </div>
  )
}

function Campo({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#7a7570' }}>{label}</label>
      {children}
    </div>
  )
}

function SItem({ label, val }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, color: '#2d5a3d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: 15, color: '#1a1814' }}>{val}</span>
    </div>
  )
}

// ─── Estilos fieles al original ───────────────────────────────────────────────
const s = {
  page: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '24px 16px 48px',
    fontFamily: "'DM Sans', system-ui, sans-serif",
    background: '#f7f4ef',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
    marginBottom: 28,
    paddingBottom: 20,
    borderBottom: '1px solid #e0dbd3',
  },
  h1: {
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: 26,
    color: '#1a1814',
    letterSpacing: '-0.3px',
    fontWeight: 400,
  },
  headerSub: { fontSize: 13, color: '#7a7570', fontWeight: 300 },

  card: {
    background: '#ffffff',
    border: '1px solid #e0dbd3',
    borderRadius: 10,
    padding: 20,
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#7a7570',
    marginBottom: 10,
  },

  tabs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 5,
    marginBottom: 16,
  },
  tab: {
    padding: '8px 4px',
    border: '1.5px solid #e0dbd3',
    borderRadius: 8,
    background: 'transparent',
    color: '#7a7570',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'center',
    lineHeight: 1.3,
    fontFamily: 'inherit',
  },
  tabActive: {
    background: '#2d5a3d',
    borderColor: '#2d5a3d',
    color: 'white',
  },

  selectWrap: { position: 'relative' },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1.5px solid #e0dbd3',
    borderRadius: 8,
    fontFamily: 'inherit',
    fontSize: 14,
    color: '#1a1814',
    background: '#f7f4ef',
    appearance: 'none',
    outline: 'none',
  },
  selectArrow: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#7a7570',
    pointerEvents: 'none',
    fontSize: 12,
  },

  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1.5px solid #e0dbd3',
    borderRadius: 8,
    fontFamily: 'inherit',
    fontSize: 14,
    color: '#1a1814',
    background: '#f7f4ef',
    outline: 'none',
    boxSizing: 'border-box',
  },

  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },

  summary: {
    display: 'flex',
    gap: 20,
    padding: '14px 16px',
    background: '#e8f0eb',
    borderRadius: 8,
    marginTop: 12,
    flexWrap: 'wrap',
  },

  infoBox: {
    background: '#e8f0eb',
    border: '1px solid #c2d9c9',
    borderRadius: 8,
    padding: '12px 14px',
    fontSize: 13,
    color: '#2d5a3d',
    lineHeight: 1.5,
  },

  btnPrimary: {
    width: '100%',
    padding: 13,
    background: '#2d5a3d',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontFamily: 'inherit',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: 8,
  },

  textarea: {
    width: '100%',
    height: 320,
    padding: 14,
    border: 'none',
    fontFamily: "'DM Mono', 'Courier New', monospace",
    fontSize: 13,
    lineHeight: 1.6,
    color: '#1a1814',
    background: '#f7f4ef',
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
  },

  btnRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 },
  btnSecondary: {
    padding: 11,
    background: 'transparent',
    color: '#1a1814',
    border: '1.5px solid #e0dbd3',
    borderRadius: 8,
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnWA: { borderColor: '#25d366', color: '#25d366' },

  toast: {
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%) translateY(80px)',
    background: '#1a1814',
    color: 'white',
    padding: '10px 22px',
    borderRadius: 99,
    fontSize: 13,
    fontWeight: 500,
    pointerEvents: 'none',
    zIndex: 100,
    transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
  },
  toastShow: { transform: 'translateX(-50%) translateY(0)' },
}
