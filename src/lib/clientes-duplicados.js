const texto = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
const nombre = c => texto([c.nombre, c.apellido].filter(Boolean).join(' '))
const documento = value => texto(value).replace(/[.\s-]/g, '')
const telefono = value => String(value || '').replace(/\D/g, '')

export function coincidenciasCliente(nuevo, clientes) {
  return clientes.filter(c => c.id !== nuevo.id).map(c => {
    const motivos = []
    if (nombre(nuevo) && nombre(nuevo) === nombre(c)) motivos.push('nombre')
    if (documento(nuevo.dni) && documento(nuevo.dni) === documento(c.dni)) motivos.push('DNI')
    if (texto(nuevo.email) && texto(nuevo.email) === texto(c.email)) motivos.push('email')
    if (telefono(nuevo.whatsapp) && telefono(nuevo.whatsapp) === telefono(c.whatsapp)) motivos.push('teléfono')
    return { cliente: c, motivos }
  }).filter(c => c.motivos.length)
}

export async function confirmarClienteNuevo(db, datos, confirmar) {
  const clientes = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('clientes').select('id,nombre,apellido,dni,email,whatsapp')
      .order('id').range(offset, offset + 999)
    if (error) throw new Error('No se pudieron verificar clientes existentes. Reintentá antes de guardar.')
    clientes.push(...data)
    if (data.length < 1000) break
  }
  const coincidencias = coincidenciasCliente(datos, clientes)
  if (!coincidencias.length) return true
  const detalle = coincidencias.slice(0, 4).map(({ cliente, motivos }) =>
    `${[cliente.nombre, cliente.apellido].filter(Boolean).join(' ')} (${motivos.join(', ')})`).join('\n')
  return confirmar(`Ya hay clientes con datos coincidentes:\n${detalle}${coincidencias.length > 4 ? '\nHay más coincidencias.' : ''}\n\nPodés cancelar y seleccionar el existente. ¿Querés crear otro cliente de todas formas?`, {titulo:'Posible cliente duplicado', aceptar:'Crear de todas formas'})
}
