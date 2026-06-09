import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ─── Número en letras (portado del original) ──────────────────────────────────
function numeroALetras(n) {
  if (!n || isNaN(n)) return '';
  n = Math.round(Number(n));
  if (n === 0) return 'CERO';
  const u = [
    '',
    'UNO',
    'DOS',
    'TRES',
    'CUATRO',
    'CINCO',
    'SEIS',
    'SIETE',
    'OCHO',
    'NUEVE',
    'DIEZ',
    'ONCE',
    'DOCE',
    'TRECE',
    'CATORCE',
    'QUINCE',
    'DIECISÉIS',
    'DIECISIETE',
    'DIECIOCHO',
    'DIECINUEVE',
  ];
  const d = [
    '',
    '',
    'VEINTE',
    'TREINTA',
    'CUARENTA',
    'CINCUENTA',
    'SESENTA',
    'SETENTA',
    'OCHENTA',
    'NOVENTA',
  ];
  const c = [
    '',
    'CIENTO',
    'DOSCIENTOS',
    'TRESCIENTOS',
    'CUATROCIENTOS',
    'QUINIENTOS',
    'SEISCIENTOS',
    'SETECIENTOS',
    'OCHOCIENTOS',
    'NOVECIENTOS',
  ];
  function grupo(n) {
    if (n === 0) return '';
    if (n < 20) return u[n];
    if (n < 100)
      return d[Math.floor(n / 10)] + (n % 10 ? ' Y ' + u[n % 10] : '');
    if (n === 100) return 'CIEN';
    return c[Math.floor(n / 100)] + (n % 100 ? ' ' + grupo(n % 100) : '');
  }
  let res = '',
    neg = n < 0;
  n = Math.abs(n);
  if (n >= 1000000) {
    const m = Math.floor(n / 1000000);
    res += (m === 1 ? 'UN MILLÓN' : grupo(m) + ' MILLONES') + ' ';
    n %= 1000000;
  }
  if (n >= 1000) {
    const m = Math.floor(n / 1000);
    res += (m === 1 ? 'MIL' : grupo(m) + ' MIL') + ' ';
    n %= 1000;
  }
  if (n > 0) res += grupo(n);
  return (neg ? 'MENOS ' : '') + res.trim();
}

// ─── Propiedades desde Supabase (se cargan dinámicamente) ─────────────────────

const CONCEPTOS = {
  reserva: 'seña / reserva (30%)',
  saldo: 'saldo de alquiler',
  total: 'pago total de alquiler',
};

const FORMAS = {
  transferencia: 'Transferencia bancaria.',
  efectivo: 'Efectivo.',
  mercadopago: 'Mercado Pago.',
};

function fmtFecha(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  const meses = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${y}`;
}

function fmtCorta(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function fmtMonto(n) {
  if (!n) return '—';
  return '$' + Number(n).toLocaleString('es-AR');
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Recibos() {
  const [panelActivo, setPanelActivo] = useState('recibo');
  const [toast, setToast] = useState('');

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }

  return (
    <div style={s.page} className="page-recibos">
      <header style={s.header}>
        <h1 style={s.h1}>Recibos</h1>
        {/*<span style={s.headerSub}>Departamentos Norte & San Bernardo</span>*/}
      </header>

      {panelActivo === 'recibo' && <PanelRecibo showToast={showToast} />}

      <div
        className="recibo-toast"
        style={{ ...s.toast, ...(toast ? s.toastShow : {}) }}
      >
        {toast}
      </div>
    </div>
  );
}

// ─── Panel de recibo ──────────────────────────────────────────────────────────
function PanelRecibo({ showToast }) {
  const [propiedades, setPropiedades] = useState([]);
  const [propLoading, setPropLoading] = useState(true);
  const [depto, setDepto] = useState('');
  const [nro, setNro] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('reserva');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [formaPago, setFormaPago] = useState('transferencia');
  const [comprobante, setComprobante] = useState('');
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [direccion, setDireccion] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  const [guardando, setGuardando] = useState(false);

  // IA parser
  const [fichaTexto, setFichaTexto] = useState('');
  const [parseando, setParseando] = useState(false);
  const [parseStatus, setParseStatus] = useState(null); // null | 'ok' | 'error'
  const [parseMsg, setParseMsg] = useState('');

  // Cliente
  const [busqueda, setBusqueda] = useState('');
  const [clientesRes, setClientesRes] = useState([]);
  const [clienteId, setClienteId] = useState(null);
  const [modoCliente, setModoCliente] = useState('buscar'); // 'buscar' | 'nuevo' | 'seleccionado'

  useEffect(() => {
    async function cargarPropiedades() {
      const { data } = await supabase
        .from('propiedades')
        .select('id, nombre, direccion, activa')
        .order('nombre')
      setPropiedades(data ?? [])
      if (data?.length > 0) setDepto(data[0].id)
      setPropLoading(false)
    }
    cargarPropiedades()
  }, [])

  useEffect(() => {
    if (busqueda.length < 2) { setClientesRes([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, apellido, dni, whatsapp, email, ciudad, domicilio')
        .or(`nombre.ilike.%${busqueda}%,apellido.ilike.%${busqueda}%,dni.ilike.%${busqueda}%`)
        .limit(6)
      setClientesRes(data ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda])

  function seleccionarCliente(c) {
    setClienteId(c.id)
    setNombre((c.nombre || '') + (c.apellido ? ' ' + c.apellido : ''))
    setDni(c.dni || '')
    setDireccion(c.domicilio || '')
    setLocalidad(c.ciudad || '')
    setTel(c.whatsapp || '')
    setEmail(c.email || '')
    setModoCliente('seleccionado')
    setClientesRes([])
    setBusqueda('')
  }

  function nuevoCliente() {
    setClienteId(null)
    setModoCliente('nuevo')
    setBusqueda('')
    setClientesRes([])
  }

  const deptoData = propiedades.find(p => p.id === depto) || {}
  const montoLetras = monto
    ? numeroALetras(Number(monto)) + ' PESOS ARGENTINOS'
    : '—';
  async function parsearFicha() {
    if (!fichaTexto.trim()) {
      showToast('Pegá el texto de la ficha primero');
      return;
    }

    setParseando(true);
    setParseStatus(null);

    try {
      const res = await fetch('https://deptos-proxy.vercel.app/api/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          texto: fichaTexto, // 👈 único dato que mandás
        }),
      });

      if (!res.ok) throw new Error('HTTP ' + res.status);

      const parsed = await res.json(); // 👈 ya viene limpio

      if (parsed.nombre) setNombre(parsed.nombre);
      if (parsed.dni) setDni(parsed.dni);
      if (parsed.direccion) setDireccion(parsed.direccion);
      if (parsed.localidad) setLocalidad(parsed.localidad);
      if (parsed.tel) setTel(parsed.tel);
      if (parsed.email) setEmail(parsed.email);
      if (parsed.desde) setDesde(parsed.desde);
      if (parsed.hasta) setHasta(parsed.hasta);

      setParseStatus('ok');
      setParseMsg('Datos extraídos correctamente');
    } catch (err) {
      setParseStatus('error');
      setParseMsg(
        'No se pudieron extraer los datos. Revisá el texto o completá manualmente.'
      );
    } finally {
      setParseando(false);
    }
  }

  async function guardarCliente() {
    if (!nombre.trim()) {
      showToast('Completá al menos el nombre');
      return;
    }
    if (dni && !clienteId) {
      const { data: existente } = await supabase
        .from('clientes')
        .select('id')
        .eq('dni', dni)
        .limit(1)
      if (existente?.length > 0) {
        showToast('Ya existe un cliente con ese DNI');
        return;
      }
    }
    setGuardando(true);
    const { error } = await supabase.from('clientes').insert({
      nombre,
      apellido: '',
      dni: dni || null,
      domicilio: direccion || null,
      ciudad: localidad || null,
      whatsapp: tel || null,
      email: email || null,
    });
    setGuardando(false);
    if (error) showToast('Error al guardar: ' + error.message);
    else showToast('✓ Cliente guardado');
  }

  function imprimir() {
    document.body.classList.add('printing-recibo');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-recibo');
    }, 300);
  }

  function copiarTexto() {
    const d = deptoData;
    const txt = [
      `RECIBO N° ${nro || '—'}`,
      `Fecha: ${fmtFecha(fecha)}`,
      `Departamento: ${d.nombre}`,
      `Dirección: ${d.dir}`,
      '',
      `Recibí de ${nombre || '—'} la suma de ${fmtMonto(
        monto
      )} pesos argentinos`,
      `(${montoLetras}) en concepto de ${CONCEPTOS[concepto] || concepto}`,
      `correspondiente al período ${fmtFecha(desde)} al ${fmtFecha(hasta)}.`,
      '',
      `Forma de pago: ${FORMAS[formaPago] || formaPago}`,
      comprobante ? `Comprobante: ${comprobante}` : '',
      '',
      '─────────────────',
      'Aratano Matías Nicolás',
      'DNI: 35.727.388',
    ]
      .filter(Boolean)
      .join('\n');
    navigator.clipboard.writeText(txt).then(() => showToast('Texto copiado'));
  }

  return (
    <>
{/* IA Parser */}
      <div style={s.card} className="card">
        <div style={s.cardTitle}>✦ Extraer datos desde ficha del cliente</div>
        <textarea
          style={s.pasteArea}
          placeholder="Pegá acá el texto de la ficha que te mandíbel cliente (WhatsApp, email, lo que sea) y la IA va a extraer los datos automáticamente…"
          value={fichaTexto}
          onChange={(e) => setFichaTexto(e.target.value)}
        />
        <button style={s.aiBtn} onClick={parsearFicha} disabled={parseando}>
          {parseando ? '⏳ Extrayendo…' : '✦ Extraer datos con IA'}
        </button>
        {parseStatus === 'ok' && (
          <div style={{ ...s.aiStatus, ...s.aiStatusOk }}>{parseMsg}</div>
        )}
        {parseStatus === 'error' && (
          <div style={{ ...s.aiStatus, ...s.aiStatusError }}>{parseMsg}</div>
        )}
      </div>

      {/* Datos del cliente */}
      <div style={s.card} className="card">
        <div style={s.cardTitle}>Datos del cliente</div>

        <Campo label="Buscar cliente (opcional)" style={{ marginBottom: 10 }}>
          <input
            type="text"
            style={s.input}
            placeholder="Nombre, apellido o DNI para buscar uno existente…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </Campo>
        {clientesRes.length > 0 && (
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', marginBottom: 14, marginTop: -6 }}>
            {clientesRes.map(c => (
              <div
                key={c.id}
                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                onClick={() => seleccionarCliente(c)}
              >
                <div style={{ fontWeight: 500, fontSize: 14 }}>{c.nombre} {c.apellido}</div>
                <div style={{ fontSize: 12, color: '#888' }}>DNI {c.dni || '—'} · {c.ciudad || ''}</div>
              </div>
            ))}
          </div>
        )}

        {clienteId && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13 }}>{nombre} <span style={{ color: '#888' }}>· DNI {dni || '—'}</span></div>
              <button style={{ background: 'none', border: 'none', color: '#2d5a3d', cursor: 'pointer', fontSize: 12 }} onClick={() => { setClienteId(null); setModoCliente('buscar') }}>
                Cambiar
              </button>
            </div>
          </div>
        )}

        <div style={{ ...s.formGrid2, marginBottom: 12 }}>
          <Campo label="Nombre y apellido">
            <input
              style={s.input}
              placeholder="Juan García"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </Campo>
          <Campo label="DNI">
            <input
              style={s.input}
              placeholder="28.456.789"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
            />
          </Campo>
        </div>
        <div style={{ ...s.formGrid2, marginBottom: 12 }}>
          <Campo label="Dirección">
            <input
              style={s.input}
              placeholder="Av. Rivadavia 1234"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
            />
          </Campo>
          <Campo label="Localidad">
            <input
              style={s.input}
              placeholder="Buenos Aires"
              value={localidad}
              onChange={(e) => setLocalidad(e.target.value)}
            />
          </Campo>
        </div>
        <div style={s.formGrid2}>
          <Campo label="Celular">
            <input
              style={s.input}
              placeholder="11 5678-9012"
              value={tel}
              onChange={(e) => setTel(e.target.value)}
            />
          </Campo>
          <Campo label="Email">
            <input
              style={s.input}
              placeholder="juan@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Campo>
        </div>
      </div>

      {/* Datos del recibo */}
      <div style={s.card} className="card">
        <div style={s.cardTitle}>Datos del recibo</div>

        <div style={{ ...s.formGrid3, marginBottom: 12 }}>
          <Campo label="Departamento">
            <div style={s.selectWrap}>
              <select
                style={s.input}
                value={depto}
                onChange={(e) => setDepto(e.target.value)}
                disabled={propLoading}
              >
                {propLoading ? (
                  <option value="">Cargando...</option>
                ) : propiedades.length === 0 ? (
                  <option value="">No hay propiedades</option>
                ) : (
                  propiedades.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}{p.activa === false ? ' (cerrada)' : ''}
                    </option>
                  ))
                )}
              </select>
              <span style={s.arrow}>▾</span>
            </div>
          </Campo>
          <Campo label="N° de recibo">
            <input
              style={s.input}
              placeholder="022"
              value={nro}
              onChange={(e) => setNro(e.target.value)}
            />
          </Campo>
          <Campo label="Fecha">
            <input
              type="date"
              style={s.input}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </Campo>
        </div>

        <div style={{ ...s.formGrid2, marginBottom: 12 }}>
          <Campo label="Monto ($)">
            <input
              type="number"
              style={s.input}
              placeholder="287000"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </Campo>
          <Campo label="Concepto">
            <div style={s.selectWrap}>
              <select
                style={s.input}
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
              >
                <option value="reserva">Seña / Reserva (30%)</option>
                <option value="saldo">Saldo de alquiler</option>
                <option value="total">Pago total de alquiler</option>
              </select>
              <span style={s.arrow}>▾</span>
            </div>
          </Campo>
        </div>

        <Campo label="Monto en letras" style={{ marginBottom: 12 }}>
          <div style={s.montoDisplay}>{montoLetras}</div>
        </Campo>

        <div style={{ ...s.formGrid2, marginBottom: 12 }}>
          <Campo label="Período desde">
            <input
              type="date"
              style={s.input}
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </Campo>
          <Campo label="Período hasta">
            <input
              type="date"
              style={s.input}
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </Campo>
        </div>

        <div style={{ ...s.formGrid2, marginBottom: 4 }}>
          <Campo label="Forma de pago">
            <div style={s.selectWrap}>
              <select
                style={s.input}
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value)}
              >
                <option value="transferencia">Transferencia bancaria</option>
                <option value="efectivo">Efectivo</option>
                <option value="mercadopago">Mercado Pago</option>
              </select>
              <span style={s.arrow}>▾</span>
            </div>
          </Campo>
          <Campo label="N° comprobante (opcional)">
            <input
              style={s.input}
              placeholder="136893734331"
              value={comprobante}
              onChange={(e) => setComprobante(e.target.value)}
            />
          </Campo>
        </div>
      </div>

      {/* Vista previa del recibo */}
      <div style={s.card} className="card" id="preview-card">
        <div style={s.cardTitle} className="print-hide">
          Vista previa
        </div>
        <div id="recibo-preview" style={s.reciboPreview}>
          <div style={s.watermark}>RECIBO</div>

          {/* Header del recibo */}
          <div style={s.reciboHeader}>
            <div>
              <div style={s.reciboLogoNombre}>{deptoData.nombre || '—'}</div>
              <div style={s.reciboLogoDir}>{deptoData.direccion || '—'}</div>
            </div>
            <div
              style={{
                textAlign: 'right',
                fontFamily: "'Source Sans 3', sans-serif",
              }}
            >
              <div style={s.reciboNro}>N° {nro || '—'}</div>
              <div style={s.reciboTipo}>Recibo de reserva</div>
              <div style={s.reciboFecha}>{fmtFecha(fecha)}</div>
            </div>
          </div>

          <div style={s.reciboNoDoc}>
            ✕ &nbsp; Documento no válido como factura &nbsp; ✕
          </div>

          <div style={s.reciboBody}>
            <p style={{ marginBottom: 10, textAlign: 'justify' }}>
              Recibí de <strong>{nombre || '—'}</strong> la suma de{' '}
              <strong>{fmtMonto(monto)}</strong> pesos argentinos (
              <span style={{ textTransform: 'uppercase' }}>
                {monto ? numeroALetras(Number(monto)) : '—'}
              </span>
              ) en concepto de <span>{CONCEPTOS[concepto] || '—'}</span> del
              departamento <span>{deptoData.nombre || '—'}{deptoData.direccion ? ` – ${deptoData.direccion}` : ''}</span>, correspondiente al
              período{' '}
              <strong>
                {fmtFecha(desde)} al {fmtFecha(hasta)}
              </strong>
              .
            </p>
          </div>

          <div style={s.reciboPago}>
            Forma de pago: {FORMAS[formaPago]}
            {comprobante ? ` Comprobante N° ${comprobante}.` : ''}
          </div>

          {/* Firma */}
          <div style={s.reciboFirma}>
            <img
              src="/firma.png"
              alt="Firma"
              style={{
                maxHeight: 64,
                maxWidth: 200,
                objectFit: 'contain',
                display: 'block',
                marginBottom: 2,
              }}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <div style={s.firmaLine}>
              <div style={s.firmaNombre}>Aratano Matías Nicolás</div>
              <div style={s.firmaDni}>DNI: 35.727.388</div>
            </div>
          </div>

          {/* Datos del inquilino */}
          <div style={s.reciboInqBox}>
            <div style={s.reciboInqTitle}>Datos del inquilino</div>
            <div style={s.reciboInqGrid}>
              <InqItem label="Nombre" val={nombre || '—'} />
              <InqItem label="DNI" val={dni || '—'} />
              <InqItem label="Dirección" val={direccion || '—'} />
              <InqItem label="Localidad" val={localidad || '—'} />
              <InqItem label="Celular" val={tel || '—'} />
              <InqItem label="Email" val={email || '—'} />
            </div>
          </div>

          <div style={s.reciboPie}>
            Alquiler {deptoData.nombre || '—'}. Desde el {fmtFecha(desde)} hasta el{' '}
            {fmtFecha(hasta)}.
          </div>
        </div>

        {/* Acciones */}
        <div style={s.actionRow} className="action-row">
          <button style={s.btnAct} onClick={imprimir}>
            🖨️ Imprimir / PDF
          </button>
          <button style={s.btnAct} onClick={copiarTexto}>
            📋 Copiar texto
          </button>
          <button
            style={{
              ...s.btnAct,
              ...s.btnActPrimary,
              opacity: guardando ? 0.7 : 1,
            }}
            onClick={guardarCliente}
            disabled={guardando}
          >
            {guardando ? 'Guardando…' : '💾 Guardar cliente'}
          </button>
        </div>
      </div>

      {/* Los estilos de impresión están en src/index.css */}
    </>
  );
}

function InqItem({ label, val }) {
  return (
    <div>
      <span style={{ color: '#777', fontSize: 12.5 }}>{label}: </span>
      <span style={{ fontWeight: 500, fontSize: 12.5 }}>{val}</span>
    </div>
  );
}

// ─── Panel de inquilinos ──────────────────────────────────────────────────────
function PanelInquilinos({ showToast }) {
  const [inquilinos, setInquilinos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    const { data } = await supabase
      .from('inquilinos')
      .select('*')
      .order('created_at', { ascending: false });
    setInquilinos(data ?? []);
    setLoading(false);
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este registro?')) return;
    await supabase.from('inquilinos').delete().eq('id', id);
    showToast('Registro eliminado');
    cargar();
  }

  function exportarCSV() {
    if (!inquilinos.length) {
      showToast('No hay datos para exportar');
      return;
    }
    const cols = [
      'nombre',
      'dni',
      'direccion',
      'localidad',
      'tel',
      'email',
      'depto',
      'desde',
      'hasta',
      'monto',
      'nro_recibo',
      'fecha_recibo',
      'created_at',
    ];
    const header = cols.join(';');
    const rows = inquilinos.map((r) =>
      cols
        .map((c) => `"${(r[c] || '').toString().replace(/"/g, '""')}"`)
        .join(';')
    );
    const csv = [header, ...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
    a.download = 'inquilinos_deptos.csv';
    a.click();
  }

  return (
    <div style={s.card} className="card">
      <div style={s.cardTitle}>Base de inquilinos</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button style={s.btnSm} onClick={exportarCSV}>
          ⬇ Exportar CSV
        </button>
        <button style={s.btnSm} onClick={cargar}>
          ↻ Actualizar
        </button>
      </div>

      {loading ? (
        <div style={s.emptyState}>Cargando…</div>
      ) : inquilinos.length === 0 ? (
        <div style={s.emptyState}>
          No hay inquilinos guardados aún.
          <br />
          Generá un recibo y presioná "Guardar inquilino".
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tabla}>
            <thead>
              <tr>
                {[
                  'Nombre',
                  'DNI',
                  'Localidad',
                  'Depto',
                  'Período',
                  'Monto',
                  '',
                ].map((h) => (
                  <th key={h} style={s.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inquilinos.map((r) => (
                <tr key={r.id}>
                  <td style={s.td}>
                    <strong>{r.nombre}</strong>
                    {r.email && (
                      <>
                        <br />
                        <small style={{ color: '#7a7570' }}>{r.email}</small>
                      </>
                    )}
                  </td>
                  <td style={s.td}>{r.dni || '—'}</td>
                  <td style={s.td}>{r.localidad || '—'}</td>
                  <td style={s.td}>
                    <span style={s.tag}>
                      {(r.depto || '')
                        .replace('Departamento N°', 'D')
                        .replace('Duplex ', '')}
                    </span>
                  </td>
                  <td style={{ ...s.td, fontSize: 12 }}>
                    {r.desde && r.hasta
                      ? `${fmtCorta(r.desde)} – ${fmtCorta(r.hasta)}`
                      : '—'}
                  </td>
                  <td style={{ ...s.td, fontSize: 12 }}>
                    {r.monto
                      ? '$' + Number(r.monto).toLocaleString('es-AR')
                      : '—'}
                  </td>
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                    <button style={s.linkBtn} onClick={() => eliminar(r.id)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function Campo({ label, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: '#7a7570',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = {
  page: {
    maxWidth: 820,
    margin: '0 auto',
    padding: '24px 16px 60px',
    fontFamily: "'Source Sans 3', system-ui, sans-serif",
    background: '#f0ece3',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 14,
    marginBottom: 28,
    paddingBottom: 18,
    borderBottom: '1px solid #e0dbd3',
  },
  h1: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 24,
    fontWeight: 600,
    color: '#1a1814',
  },
  headerSub: { fontSize: 13, color: '#7a7570', fontWeight: 300 },

  mainTabs: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 6,
    marginBottom: 20,
  },
  mainTab: {
    padding: 11,
    border: '1.5px solid #e0dbd3',
    borderRadius: 10,
    background: 'transparent',
    color: '#7a7570',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  mainTabActive: {
    background: '#2d5a3d',
    borderColor: '#2d5a3d',
    color: '#fff',
    fontWeight: 600,
  },

  card: {
    background: '#fff',
    border: '1px solid #e0dbd3',
    borderRadius: 10,
    padding: 22,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#7a7570',
    marginBottom: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },

  pasteArea: {
    width: '100%',
    minHeight: 120,
    padding: 14,
    background: '#f7f4ef',
    border: '1.5px dashed #e0dbd3',
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 13,
    color: '#1a1814',
    resize: 'vertical',
    outline: 'none',
    lineHeight: 1.6,
    boxSizing: 'border-box',
  },
  aiBtn: {
    width: '100%',
    marginTop: 10,
    padding: 12,
    background: '#2d5a3d',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  aiStatus: {
    padding: '10px 14px',
    borderRadius: 6,
    fontSize: 13,
    marginTop: 10,
  },
  aiStatusOk: {
    background: '#e8f0eb',
    border: '1px solid #c2d9c9',
    color: '#2d7a4f',
  },
  aiStatusError: {
    background: '#fdf0ef',
    border: '1px solid #f5c6c2',
    color: '#c0392b',
  },

  formGrid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  formGrid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },

  input: {
    padding: '9px 12px',
    background: '#f7f4ef',
    border: '1.5px solid #e0dbd3',
    borderRadius: 6,
    fontFamily: 'inherit',
    fontSize: 14,
    color: '#1a1814',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    appearance: 'none',
  },
  selectWrap: { position: 'relative' },
  arrow: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#7a7570',
    pointerEvents: 'none',
    fontSize: 11,
  },

  montoDisplay: {
    padding: '10px 14px',
    background: '#e8f0eb',
    border: '1px solid #c2d9c9',
    borderRadius: 6,
    fontSize: 13,
    color: '#2d5a3d',
    fontStyle: 'italic',
    minHeight: 38,
    display: 'flex',
    alignItems: 'center',
  },

  divider: { height: 1, background: '#e0dbd3', margin: '16px 0' },
  subsectionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#7a7570',
    marginBottom: 12,
    fontWeight: 600,
  },

  // Recibo imprimible
  reciboPreview: {
    background: 'white',
    color: '#111',
    borderRadius: 10,
    padding: '38px 44px',
    fontFamily: "'Source Serif 4', Georgia, serif",
    fontSize: 13.5,
    lineHeight: 1.65,
    boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
    position: 'relative',
    marginBottom: 16,
  },
  watermark: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%,-50%) rotate(-35deg)',
    fontSize: 80,
    fontWeight: 700,
    color: 'rgba(0,0,0,0.03)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    fontFamily: "'Playfair Display', serif",
  },
  reciboHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
    paddingBottom: 14,
    borderBottom: '2px solid #111',
  },
  reciboLogoNombre: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 15,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    lineHeight: 1.3,
  },
  reciboLogoDir: {
    fontSize: 12,
    color: '#555',
    marginTop: 3,
    fontFamily: "'Source Sans 3', sans-serif",
  },
  reciboNro: {
    fontSize: 22,
    fontWeight: 700,
    fontFamily: "'Playfair Display', serif",
  },
  reciboTipo: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#777',
    marginTop: 2,
  },
  reciboFecha: { fontSize: 12, color: '#444', marginTop: 4 },
  reciboNoDoc: {
    textAlign: 'center',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: '#888',
    padding: '5px 0',
    borderTop: '1px dashed #ccc',
    borderBottom: '1px dashed #ccc',
    marginBottom: 20,
    fontFamily: "'Source Sans 3', sans-serif",
  },
  reciboBody: { marginBottom: 18 },
  reciboPago: {
    padding: '10px 14px',
    background: '#f8f7f5',
    borderLeft: '3px solid #c9a84c',
    borderRadius: '0 4px 4px 0',
    fontSize: 13,
    marginBottom: 22,
    fontFamily: "'Source Sans 3', sans-serif",
  },
  reciboFirma: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 24,
    gap: 4,
  },
  firmaLine: { borderTop: '1px solid #333', paddingTop: 6, minWidth: 200 },
  firmaNombre: {
    fontWeight: 600,
    fontSize: 13,
    fontFamily: "'Source Sans 3', sans-serif",
  },
  firmaDni: {
    color: '#666',
    fontSize: 11,
    fontFamily: "'Source Sans 3', sans-serif",
  },
  reciboInqBox: {
    border: '1px solid #ddd',
    borderRadius: 4,
    padding: '14px 16px',
    marginBottom: 16,
    fontFamily: "'Source Sans 3', sans-serif",
  },
  reciboInqTitle: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#888',
    marginBottom: 8,
    fontWeight: 600,
  },
  reciboInqGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '4px 20px',
  },
  reciboPie: {
    textAlign: 'center',
    paddingTop: 12,
    borderTop: '1px solid #eee',
    fontSize: 12,
    fontStyle: 'italic',
    color: '#555',
  },

  actionRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  btnAct: {
    padding: 12,
    border: '1.5px solid #e0dbd3',
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    background: 'transparent',
    color: '#1a1814',
  },
  btnActPrimary: {
    background: '#2d5a3d',
    borderColor: '#2d5a3d',
    color: '#fff',
    fontWeight: 600,
  },

  // Tabla inquilinos
  tabla: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#7a7570',
    fontWeight: 600,
    borderBottom: '1px solid #e0dbd3',
  },
  td: {
    padding: '9px 10px',
    borderBottom: '1px solid #e0dbd3',
    color: '#1a1814',
    verticalAlign: 'top',
  },
  tag: {
    display: 'inline-block',
    padding: '2px 8px',
    background: '#e8f0eb',
    color: '#2d5a3d',
    borderRadius: 99,
    fontSize: 11,
  },
  emptyState: {
    textAlign: 'center',
    padding: 32,
    color: '#7a7570',
    fontSize: 13,
  },
  btnSm: {
    padding: '7px 14px',
    border: '1.5px solid #e0dbd3',
    borderRadius: 6,
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    background: 'transparent',
    color: '#7a7570',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: '#c0392b',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'inherit',
  },

  toast: {
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%) translateY(60px)',
    background: '#1a1814',
    color: 'white',
    padding: '10px 20px',
    borderRadius: 99,
    fontSize: 13,
    fontWeight: 600,
    transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
    pointerEvents: 'none',
    zIndex: 100,
  },
  toastShow: { transform: 'translateX(-50%) translateY(0)' },
};
