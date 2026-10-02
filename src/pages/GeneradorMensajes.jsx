import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { detalleSolicitud, voucherSolicitud, datosVoucherReserva, fechaSolicitud } from '../lib/solicitudes.js'

const voucherVacio = () => ({titular:'',checkin:'',checkout:'',adultos:'2',menores:'0',total:'',pagado:'',verificado:false})

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

  return 'Hola!\n'
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
  const intro     = p.intro_personalizado ?? 'Gracias por tu interés en Departamentos Norte. A continuación te envío los datos para continuar con tu solicitud:'
  const esPN      = !p.marca
  const firmaWeb  = esDP(esPN)
  // const webSec   = p.link_web ? 'Ver fotos: ' + p.link_web + '\n' : ''

  return `Asunto: Solicitud de reserva (sin confirmar) – ${p.nombre}\n\n${intro}\n\n`
    + SEP + 'POLÍTICAS DE PAGO\n' + SEP
    + '  • Método de pago:\n'
    + '  • Seña: 30% del total. Transferencia bancaria.\n'
    + '  • Saldo restante: 70% en efectivo o transferencia al ingresar.\n'
    + '  • Una vez recibida la ficha, revisamos disponibilidad y te enviamos el detalle para pagar. Completarla no bloquea fechas.\n'
    + '  • La reserva se confirma al verificar el pago.\n\n'
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
  return detalleSolicitud({checkin:detCheckin,checkout:detCheckout,precio_total:detTotal},p)
}

function genNoDisponible(p, { ndDesde, ndHasta }) {
  const fechas = (ndDesde && ndHasta)
    ? `del ${fmtFecha(ndDesde)} al ${fmtFecha(ndHasta)}`
    : 'para las fechas consultadas'
  const fw = esDP(!p.marca)

  return `Hola!\n\nGracias por tu consulta.\n\n`
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
  const [voucher, setVoucher] = useState(voucherVacio)
  const [origenVoucher,setOrigenVoucher] = useState('manual')
  const [clientesVoucher,setClientesVoucher] = useState([]), [reservasVoucher,setReservasVoucher] = useState([])
  const [seleccionVoucher,setSeleccionVoucher] = useState(''), [busquedaVoucher,setBusquedaVoucher] = useState('')
  const [cargandoVoucher,setCargandoVoucher] = useState(false), [errorVoucher,setErrorVoucher] = useState('')
  const [reintentoVoucher,setReintentoVoucher] = useState(0)
  const [incluirSinReservas,setIncluirSinReservas] = useState(false)
  function cambiarVoucher(key,value) { setVoucher(v=>({...v,[key]:value}));setResultado('') }

  useEffect(()=>{
    if(tab!=='voucher' || origenVoucher==='manual')return
    let activo=true
    async function cargar() {
      setCargandoVoucher(true);setErrorVoucher('')
      try {
        const rows=[]
        for(let offset=0;;offset+=500) {
          let query=origenVoucher==='cliente'
            ? supabase.from('clientes').select('id,nombre,apellido,reservas(id,estado)').order('apellido').order('nombre').order('id')
            : supabase.from('reservas').select('id,propiedad_id,checkin,checkout,adultos,menores,precio_total,estado,clientes(nombre,apellido),propiedades(*),pagos(monto,confirmado)').in('estado',['confirmada','finalizada']).order('checkin',{ascending:false}).order('id')
          const {data,error}=await query.range(offset,offset+499)
          if(error)throw error
          rows.push(...data)
          if(data.length<500)break
        }
        if(activo) { if(origenVoucher==='cliente')setClientesVoucher(rows.filter(c=>incluirSinReservas || c.reservas?.some(r=>!['cancelada','cerrada'].includes(r.estado))).sort((a,b)=>`${a.apellido || ''} ${a.nombre || ''}`.trim().localeCompare(`${b.apellido || ''} ${b.nombre || ''}`.trim(),'es',{sensitivity:'base'})));else setReservasVoucher(rows) }
      } catch { if(activo)setErrorVoucher('No se pudieron cargar los datos. Reintentá o usá la carga manual.') }
      finally { if(activo)setCargandoVoucher(false) }
    }
    cargar()
    return ()=>{activo=false}
  },[tab,origenVoucher,reintentoVoucher,incluirSinReservas])

  function elegirOrigen(value) { setOrigenVoucher(value);setSeleccionVoucher('');setBusquedaVoucher('');setVoucher(voucherVacio());setResultado('');setErrorVoucher('') }
  function elegirVoucher(value) {
    setSeleccionVoucher(value);setResultado('')
    if(!value) { setVoucher(voucherVacio());return }
    if(origenVoucher==='cliente') {
      const cliente=clientesVoucher.find(c=>c.id===value)
      setVoucher({...voucherVacio(),titular:[cliente?.nombre,cliente?.apellido].filter(Boolean).join(' ')})
    } else {
      const reserva=reservasVoucher.find(r=>r.id===value)
      if(!reserva)return
      setVoucher(datosVoucherReserva(reserva));setPropId(reserva.propiedad_id)
      if(reserva.propiedades)setProps(ps=>ps.some(p=>p.id===reserva.propiedad_id)?ps:[...ps,{...reserva.propiedades,id:reserva.propiedad_id}])
    }
  }

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
    if (tab === 'cotizacion' && (!cotDesde || !cotHasta || cotN <= 0 || Number(cotPxn) <= 0)) {
      showToast('Completá fechas válidas y un precio por noche mayor a cero.'); return
    }
    if (tab === 'detalle' && (!detCheckin || !detCheckout || detN <= 0 || Number(detTotal) <= 0)) {
      showToast('Completá fechas válidas y un precio total mayor a cero.'); return
    }
    if (tab === 'detalle' && !propiedad.alias_cbu) { showToast('Completá el alias de cobro del departamento en Admin.'); return }
    if (tab === 'voucher' && (!voucher.titular.trim() || !voucher.checkin || !voucher.checkout || calcNoches(voucher.checkin,voucher.checkout)<=0 || !Number.isFinite(Number(voucher.total)) || Number(voucher.total)<=0 || !Number.isFinite(Number(voucher.pagado)) || Number(voucher.pagado)<=0 || Number(voucher.pagado)>Number(voucher.total) || !Number.isInteger(Number(voucher.adultos)) || Number(voucher.adultos)<1 || !Number.isInteger(Number(voucher.menores)) || Number(voucher.menores)<0 || !voucher.verificado)) {
      const problemas=[]
      if(!voucher.titular.trim())problemas.push('titular')
      if(!voucher.checkin || !voucher.checkout || calcNoches(voucher.checkin,voucher.checkout)<=0)problemas.push('fechas válidas')
      if(!Number.isFinite(Number(voucher.total)) || Number(voucher.total)<=0)problemas.push('precio total')
      if(!Number.isFinite(Number(voucher.pagado)) || Number(voucher.pagado)<=0 || Number(voucher.pagado)>Number(voucher.total))problemas.push('pago recibido válido')
      if(!Number.isInteger(Number(voucher.adultos)) || Number(voucher.adultos)<1 || !Number.isInteger(Number(voucher.menores)) || Number(voucher.menores)<0)problemas.push('cantidad de huéspedes')
      showToast(problemas.length?`Revisá: ${problemas.join(', ')}.`:'Marcá la casilla de verificación de la reserva y el pago.'); return
    }
    let txt = ''
    if (tab === 'cotizacion') {
      txt = genCotizacion(propiedad, { cotDesde, cotHasta, cotPxn, cotPersonas })
    } else if (tab === 'ficha') {
      txt = genFicha(propiedad)
    } else if (tab === 'detalle') {
      txt = genDetalle(propiedad, { detCheckin, detCheckout, detTotal })
    } else if (tab === 'voucher') {
      txt = voucherSolicitud({estado:'confirmada',clientes:{nombre:voucher.titular.trim()},propiedades:propiedad,checkin:voucher.checkin,checkout:voucher.checkout,adultos:Number(voucher.adultos),menores:Number(voucher.menores),precio_total:Number(voucher.total),pagos:[{confirmado:true,monto:Number(voucher.pagado)}]})
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
    navigator.clipboard.writeText(resultado).then(() => showToast('¡Copiado!')).catch(() => showToast('No se pudo copiar. Revisá el permiso del navegador.'))
  }

  function abrirWA() {
    if (!resultado.trim()) { showToast('Generá una plantilla primero'); return }
    window.open('https://wa.me/?text=' + encodeURIComponent(resultado))
  }

  const mostrarDepto = tab !== 'derivacion'

  return (
    <div className="page-mensajes" style={s.page}>
      {/* Header */}
      <header style={s.header}>
        <h1 style={s.h1}>Mensajes</h1>
        <span style={s.headerSub}>Departamentos Norte</span>
      </header>

      {/* Tabs */}
      <div style={s.card}>
        <div style={s.cardLabel}>Tipo de mensaje</div>
        <div className="message-tabs" style={s.tabs}>
          {[
            { id: 'cotizacion',   label: '💬 Cotización' },
            { id: 'ficha',        label: '📄 Ficha' },
            { id: 'detalle',      label: '💰 Detalle' },
            { id: 'voucher',      label: '📄 Voucher' },
            { id: 'nodisponible', label: '❌ Sin disp.' },
            { id: 'derivacion',   label: '↗ Derivación' },
          ].map(t => (
            <button
              key={t.id}
              aria-pressed={tab === t.id}
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
              <select aria-label="Departamento" style={s.select} value={propId} onChange={e => {setPropId(e.target.value);setResultado('');setVoucher(v=>({...v,verificado:false}))}}>
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

      {tab === 'voucher' && <section style={s.card}>
        <div style={s.cardLabel}>Voucher de confirmación</div>
        {origenVoucher==='cliente' && <label className="voucher-verificado" style={{marginTop:0,marginBottom:16}}><input type="checkbox" checked={incluirSinReservas} onChange={e=>{setIncluirSinReservas(e.target.checked);setSeleccionVoucher('');setVoucher(voucherVacio());setResultado('')}} />Incluir clientes sin reservas</label>}
        <div style={{...s.row2,marginBottom:16}}>
          <Campo label="Completar desde"><select aria-label="Completar desde" style={s.select} value={origenVoucher} onChange={e=>elegirOrigen(e.target.value)}><option value="manual">Carga manual</option><option value="cliente">Cliente existente</option><option value="reserva">Reserva existente</option></select></Campo>
          {origenVoucher!=='manual' && <Campo label="Buscar"><input aria-label="Buscar cliente o reserva" type="search" style={s.input} placeholder="Nombre o departamento" value={busquedaVoucher} onChange={e=>setBusquedaVoucher(e.target.value)} /></Campo>}
        </div>
        {origenVoucher!=='manual' && <div style={{marginBottom:16}}>
          {cargandoVoucher ? <p role="status">Cargando…</p> : errorVoucher ? <div role="alert">{errorVoucher}<button style={s.btnSecondary} onClick={()=>setReintentoVoucher(n=>n+1)}>Reintentar</button></div> : <Campo label={origenVoucher==='cliente'?'Cliente':'Reserva'}><select aria-label={origenVoucher==='cliente'?'Cliente':'Reserva'} style={s.select} value={seleccionVoucher} onChange={e=>elegirVoucher(e.target.value)}><option value="">Seleccionar</option>{(origenVoucher==='cliente'?clientesVoucher:reservasVoucher).map(item=>({id:item.id,label:origenVoucher==='cliente'?[item.nombre,item.apellido].filter(Boolean).join(' '):`${[item.clientes?.nombre,item.clientes?.apellido].filter(Boolean).join(' ') || 'Sin cliente'} · ${item.propiedades?.nombre || 'Departamento'} · ${fechaSolicitud(item.checkin)} → ${fechaSolicitud(item.checkout)}`})).filter(item=>item.id===seleccionVoucher || item.label.toLocaleLowerCase().includes(busquedaVoucher.toLocaleLowerCase())).map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></Campo>}
        </div>}
        <div style={s.row2}>{Object.entries({titular:'Titular',checkin:'Ingreso',checkout:'Salida',adultos:'Adultos',menores:'Menores',total:'Precio total ($)',pagado:'Pagos recibidos ($)'}).map(([key,label])=><Campo label={label} key={key}><input style={s.input} type={['checkin','checkout'].includes(key)?'date':key==='titular'?'text':'number'} min={key==='menores'?0:key==='adultos'?1:0.01} step={['total','pagado'].includes(key)?'0.01':1} value={voucher[key]} onChange={e=>cambiarVoucher(key,e.target.value)} /></Campo>)}</div>
        <label className="voucher-verificado"><input type="checkbox" checked={voucher.verificado} onChange={e=>cambiarVoucher('verificado',e.target.checked)} />Verifiqué que la reserva está confirmada y recibí este pago.</label>
      </section>}

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
            navigator.clipboard.writeText(waLink).then(() => showToast('Link copiado!')).catch(() => showToast('No se pudo copiar el enlace.'))
          }}>🔗 Copiar link</button>
          <button style={{ ...s.btnSecondary, ...s.btnWA }} onClick={() => { if (waLink) window.open(waLink) }}>📲 Abrir link</button>
          <button style={s.btnSecondary} onClick={copiar}>📋 Copiar texto</button>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="app-toast" role="status" style={{ ...s.toast, ...s.toastShow }}>{toast}</div>}
    </div>
  )
}

function Campo({ label, children }) {
  return (
    <label className="campo-mensaje" style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 500, color: '#7a7570' }}>
      <span>{label}</span>
      {children}
    </label>
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
    fontFamily: 'var(--ui-font)',
    background: 'transparent',
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
    fontFamily: 'var(--ui-font)',
    fontSize: 24,
    color: '#1a1814',
    letterSpacing: '-0.3px',
    fontWeight: 700,
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
    gridTemplateColumns: 'repeat(3, 1fr)',
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

  row2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10 },

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
    fontFamily: 'var(--ui-font)',
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
