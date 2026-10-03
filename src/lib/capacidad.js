export function avisoCapacidad(propiedad, reserva) {
  const capacidad = Number(propiedad?.capacidad_max)
  const personas = Number(reserva?.adultos || 0) + Number(reserva?.menores || 0)
  if (!Number.isFinite(capacidad) || capacidad <= 0 || personas <= capacidad) return ''
  return `${propiedad.nombre || 'El alojamiento'} admite hasta ${capacidad} personas y estás cargando ${personas} (adultos y menores). Se supera la capacidad en ${personas - capacidad}.`
}
