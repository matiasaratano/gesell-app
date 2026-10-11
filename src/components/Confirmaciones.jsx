import { useEffect, useRef, useState } from 'react'
import { ConfirmacionContext } from '../lib/confirmacion.js'

export default function Confirmaciones({ children }) {
  const [mensaje, setMensaje] = useState('')
  const [opciones, setOpciones] = useState({})
  const resolver = useRef(null)
  const dialogo = useRef(null)
  useEffect(() => {
    if (mensaje && !dialogo.current.open) dialogo.current.showModal()
  }, [mensaje])
  useEffect(() => () => { resolver.current?.(false); resolver.current = null }, [])
  function terminar(valor) {
    dialogo.current.close()
    setMensaje('')
    resolver.current?.(valor)
    resolver.current = null
  }
  function confirmar(texto, opciones = {}) {
    if (resolver.current) return Promise.resolve(false)
    return new Promise(resolve => { resolver.current = resolve; setOpciones(opciones); setMensaje(texto) })
  }
  return <ConfirmacionContext.Provider value={confirmar}>
    {children}
    <dialog ref={dialogo} className="cobros app-confirmacion" aria-labelledby="confirmacion-titulo" aria-describedby="confirmacion-mensaje" onCancel={e => { e.preventDefault(); terminar(false) }}>
      <h3 id="confirmacion-titulo">{opciones.titulo || 'Confirmar eliminación'}</h3>
      <p id="confirmacion-mensaje" style={{whiteSpace:'pre-line'}}>{mensaje}</p>
      <div className="cobros-acciones"><button autoFocus onClick={() => terminar(false)}>Cancelar</button><button className={opciones.aceptar ? undefined : 'cobros-danger'} onClick={() => terminar(true)}>{opciones.aceptar || 'Eliminar'}</button></div>
    </dialog>
  </ConfirmacionContext.Provider>
}
