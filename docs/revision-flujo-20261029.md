# Revision del flujo y de las pantallas

## Recorrido habitual

WhatsApp: cotizar sin crear registros; Preparar sena traslada departamento,
fechas, personas y total al detalle. El mensaje puede pedir los datos del titular
junto con el comprobante. Ese pedido es opcional y no impide pagar.

Una vez verificado el deposito, Nueva reserva permite registrar la reserva y el
pago juntos. El voucher usa sus datos y cobros; el recibo se genera para el pago
concreto cuando hace falta. Se puede cargar solo el nombre y completar los demas
datos despues, antes de emitir los documentos que los requieren.

La excepcion existente se conserva: una reserva pendiente creada manualmente ya
ocupa fechas, aunque todavia no tenga pago. Registrar la sena la confirma.
Los mensajes por si solos nunca ocupan fechas.

Booking/Airbnb: se conserva la importacion y la proteccion de reservas gestionadas.
Un cierre preventivo no se convierte automaticamente en una reserva de huesped.
El bloqueo de plataformas sigue siendo manual e independiente del mensaje enviado.

## Ajustes implementados

- Mensajes tiene secciones mas compactas, menos marcos y acciones alineadas.
- Cotizacion pasa a Detalle sin volver a cargar los datos, tambien al abrir la
  pestana Detalle. Si se edito manualmente, se respeta ese contenido; Preparar sena
  permite reemplazarlo expresamente por los datos de la cotizacion actual.
- Detalle ofrece pedir datos completos del titular, domicilio y localidad, y
  nombre, apellido y DNI de los acompanantes, en el mismo mensaje del deposito.
- Ficha separada sigue disponible, sin exigirla como paso anterior al deposito.
- Al cambiar datos del generador se invalida el texto anterior para evitar copiar
  fechas, importes o datos de pago desactualizados. El texto sigue siendo editable.
- Cotizacion y Detalle avisan al superar la capacidad y piden confirmar la excepcion.
- Resumen y texto calculan el mismo 30%, sin diferencias de redondeo.
- La carga de alojamientos en Mensajes muestra error y permite reintentar.
- Cobros usa el estado vigente de la reserva: cancelar con la pestaña abierta ya no
  deja disponible Registrar pago. Los pagos hechos desde otra accion se refrescan.
- Nueva reserva conserva domicilio de clientes existentes y completa nombre y
  apellido extraidos por IA en su campo unico de nombre completo.
- La busqueda de clientes ignora respuestas anteriores y muestra errores de carga.
- Eliminar reserva no promete borrar pagos; muestra el motivo real del rechazo.

## Verificacion

Se revisaron acceso, inicio, calendario, nueva reserva, cobros, ficha, mensajes,
solicitudes, recibos, clientes, propiedades y reportes, mediante lectura de codigo
y pruebas con datos ficticios. No se modificaron datos de produccion.

Hay pruebas unitarias, SQL y de navegador a 1440, 390 y 320 px. Incluyen el recorrido
de Mensajes sin altas de clientes/reservas, capacidad, texto desactualizado,
cancelacion con Pagos abierto, cobro con reintento, recibo/PDF, formulario publico,
duplicados y reemplazo de cierres importados. Compilacion y lint de archivos
modificados forman parte de la verificacion.

No hay una migracion nueva: se conserva el SQL existente.

## Pendientes deliberados

- No se activo ni se desplego la limitacion de IA en el servicio externo de parseo.
  Ese servicio requiere su propia configuracion y despliegue; la prueba de IA usa
  una respuesta simulada y no confirma su disponibilidad en produccion.
- No se agrego exportacion de cierres a plataformas ni envio automatico de mensajes.
- No se borraron clientes de prueba, pagos ni solicitudes historicas.
- No se generalizaron marcas, cuentas de cobro ni politicas comerciales; siguen
  siendo una iteracion distinta.
- Queda el aviso de tamano del bundle de PDF. Separar esa carga puede mejorar el
  arranque, pero no se cambio la infraestructura de compilacion en esta revision.
