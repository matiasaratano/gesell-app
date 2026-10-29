import { useState } from 'react'

export function usePagina(filas, filtro, tamano = 50) {
  const [seleccion, setSeleccion] = useState({ filtro, numero: 0 })
  const pagina = Math.min(seleccion.filtro === filtro ? seleccion.numero : 0, Math.max(0, Math.ceil(filas.length / tamano) - 1))
  return { visibles: filas.slice(pagina * tamano, (pagina + 1) * tamano), pagina, total: filas.length, tamano, cambiar: numero => setSeleccion({ filtro, numero }) }
}
