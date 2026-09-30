const validaciones = {
  'Enlace no disponible.': 'Este enlace ya no está disponible. Pedinos uno nuevo.',
  'Datos invalidos.': 'Revisá los datos del formulario y la longitud de los campos.',
  'Completa los datos obligatorios.': 'Completá nombre, apellido, documento, teléfono y email.',
  'Email invalido.': 'Revisá el email: debe incluir una dirección completa, por ejemplo nombre@correo.com.',
  'Revisa fechas y huespedes.': 'Revisá las fechas y la cantidad de huéspedes: el ingreso no puede ser anterior a hoy y la salida debe ser posterior.',
  'Se alcanzo el limite de solicitudes. Contactanos directamente.': 'Por el momento no podemos recibir más solicitudes por este formulario. Contactanos directamente.',
}

export function errorFormulario(error) {
  if (error?.code === 'P0001' && Object.hasOwn(validaciones, error.message)) return validaciones[error.message]
  // Los detalles SQL pueden incluir datos del huesped; no se muestran en la pagina publica.
  const codigo = /^[A-Z0-9]{5,9}$/.test(error?.code || '') ? ` (código ${error.code})` : ''
  return `No se pudo registrar la solicitud${codigo}. Reintentá; si continúa, contactanos e indicá este error. Tus datos siguen en el formulario.`
}
