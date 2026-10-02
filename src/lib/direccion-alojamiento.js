export function direccionAlojamiento(propiedad = {}) {
  const direccion = propiedad?.direccion || propiedad?.ubicacion || ''
  return /alameda\s*206\b/i.test(direccion) && /\b308\b/.test(direccion)
    ? 'Alameda 206 837, entre calle 308 y 309, Barrio Norte, Villa Gesell'
    : direccion
}
