export function celdasMes(year, month) {
  const inicio = new Date(year, month, 1)
  inicio.setDate(1 - inicio.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const fecha = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i)
    return {
      ds: `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`,
      actual: fecha.getFullYear() === year && fecha.getMonth() === month,
      dia: fecha.getDate(),
    }
  })
}

export function reservaDesdeCierre(reserva) {
  if (reserva.estado !== 'cerrada') return { ...reserva }
  return { ...reserva, estado: 'confirmada', canal_origen: 'directo' }
}
