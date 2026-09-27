import { useRef, useState } from 'react'

async function crearPdf(nombre) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const node = document.getElementById('recibo-preview')
  if (!node) throw new Error('No hay un recibo disponible.')
  const canvas = await html2canvas(node, {
    scale: 2, backgroundColor: '#ffffff', logging: false, windowWidth: 1200,
    onclone: doc => {
      const recibo = doc.getElementById('recibo-preview')
      recibo.style.width = '760px'
      recibo.style.maxWidth = 'none'
      recibo.style.boxSizing = 'border-box'
      recibo.style.margin = '0'
    },
  })
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = Math.min(190, 277 * canvas.width / canvas.height)
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (210 - width) / 2, 10, width, width * canvas.height / canvas.width)
  return new File([pdf.output('blob')], nombre, { type: 'application/pdf' })
}

function descargar(file) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url; a.download = file.name
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export default function ReciboPdf({ verificar, disabled, nombre, onImprimir, onCopiar }) {
  const [ocupado, setOcupado] = useState(false)
  const [archivo, setArchivo] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const lock = useRef(false)
  const dialog = useRef(null)

  async function preparar(compartir) {
    if (lock.current) return
    lock.current = true; setOcupado(true); setMensaje('')
    try {
      if (verificar && !await verificar()) return
      const file = await crearPdf(nombre)
      if (verificar && !await verificar()) return
      if (!compartir) { descargar(file); return }
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
        descargar(file)
        setMensaje('Este navegador no permite compartir PDF. Se descargó para adjuntarlo manualmente.')
        return
      }
      setArchivo(file)
      dialog.current.showModal()
    } catch {
      setMensaje('No se pudo preparar el PDF. Podés usar Imprimir / PDF.')
    } finally { lock.current = false; setOcupado(false) }
  }

  async function compartir() {
    if (!archivo || lock.current) return
    lock.current = true; setOcupado(true)
    try {
      // Invoke sharing directly from the click to preserve Safari user activation.
      await navigator.share({ files: [archivo], title: 'Recibo de pago' })
      dialog.current.close(); setArchivo(null)
    } catch (err) {
      if (err.name !== 'AbortError') setMensaje('No se pudo compartir. Podés descargar el PDF y adjuntarlo.')
    } finally { lock.current = false; setOcupado(false) }
  }

  return <div className="cobros recibo-pdf-actions">
    <div className="recibo-acciones-unificadas"><button onClick={onImprimir} disabled={disabled || ocupado}>Imprimir / PDF</button><button onClick={onCopiar} disabled={disabled || ocupado}>Copiar texto</button><button onClick={() => preparar(true)} disabled={disabled || ocupado}>Compartir PDF</button><button onClick={() => preparar(false)} disabled={disabled || ocupado}>Descargar PDF</button></div>
    {ocupado && <p role="status">Preparando PDF…</p>}
    {mensaje && <p role="status">{mensaje}</p>}
    <dialog ref={dialog} className="recibo-pdf-dialog" aria-label="Compartir recibo" onClose={() => setArchivo(null)}>
      <h3>PDF listo</h3>
      <div className="cobros-acciones"><button className="cobros-primary" onClick={compartir} disabled={ocupado}>Elegir aplicación</button><button disabled={ocupado} onClick={() => { if (archivo) descargar(archivo); dialog.current.close() }}>Descargar PDF</button><button disabled={ocupado} onClick={() => dialog.current.close()}>Cerrar</button></div>
    </dialog>
  </div>
}
