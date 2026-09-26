import { createContext, useContext } from 'react'
export const ConfirmacionContext = createContext(null)
export function useConfirmacion() {
  const confirmar = useContext(ConfirmacionContext)
  if (!confirmar) throw new Error('Falta el proveedor de confirmaciones.')
  return confirmar
}
