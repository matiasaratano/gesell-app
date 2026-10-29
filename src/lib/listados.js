export async function leerListado(crearConsulta, tamano = 500) {
  const filas = []
  for (let desde = 0; ; desde += tamano) {
    const { data, error } = await crearConsulta().range(desde, desde + tamano - 1)
    if (error) throw error
    filas.push(...data)
    if (data.length < tamano) return filas
  }
}
