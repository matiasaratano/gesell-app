# Inicio por departamento y recibos de pagos

Esta iteracion no agrega tablas, enlaces publicos ni integraciones de mensajeria.
Usa la funcion `registrar_cobro` y los campos de limpieza ya existentes.

## Inicio

- Selector Todos / departamento, conservado en el parametro `propiedad` de la URL.
- El filtro afecta indicadores, limpieza, tareas y listas de movimientos.
- Ingresos de manana con cruce correcto de mes y anio; no cuenta cierres ni cancelaciones.
- Se conserva el inicio con sus listas habituales, sin la nueva seccion de Departamentos.
- Ingresan manana usa fondo verde agua para distinguirse de Ingresan hoy (azul).
- Cobro rapido en dialogo nativo; carga datos actuales, permite confirmar una reserva
  pendiente y conserva el UUID del pago al reintentar para evitar duplicados.
- Tareas ordenadas por ingreso, con pestanas separadas Pendientes y Pospuestas.
- El acceso al cobro rapido se conserva en las tareas de cobro.

## Calendario

Booking y Airbnb se sincronizan en secuencia y la grilla se actualiza una sola vez
al finalizar ambos canales, sin desmontarse ni mostrar una pantalla de carga entre
ellos. El reporte manual tambien se muestra una sola vez, con ambos resultados.
Los cambios de mes conservan su carga normal y se descartan respuestas atrasadas.
Si falla la actualizacion en segundo plano se mantienen las fechas previas con un aviso.

## Recibos

- Desde la ficha o cada pago contabilizado se accede al selector de reserva y pago.
- Importe, concepto, fecha, medio, periodo y datos del cliente/alojamiento se precargan.
- Se requieren nombre, DNI, domicilio y localidad del cliente, alojamiento y direccion,
  fechas validas y un pago positivo contabilizado de esa reserva. Telefono y correo son
  opcionales en esta etapa. Las mensualidades requieren el mes abonado.
- Los datos faltantes se muestran sin generar el documento. Se pueden completar datos
  del cliente existente y metadatos del pago; nunca se crea otro cliente por emitirlo.
- Antes de imprimir o copiar se releen los datos. Un pago anulado o modificado exige
  revisar nuevamente el documento. Un error de lectura impide emitirlo.
- Impresion/PDF usa el dialogo del navegador. La referencia es el ID del pago, no una
  numeracion fiscal. No se guarda una copia inmutable de documentos emitidos.
- Se mantiene la carga manual anterior como modo separado; no representa un pago
  contabilizado automaticamente ni reemplaza el circuito vinculado a la reserva.

## Verificacion

`npm test`: 48 pruebas unitarias.
`npm run test:gestion`: filtro, limpieza, error/reintento de pago, confirmacion,
cliente incompleto, recibo precargado, anulacion, fallo de lectura e impresion.
Ejecutado a 1440, 390 y 320 px con Chrome y datos ficticios.
`npm run test:ui`: recorrido general de 11 vistas en esos mismos anchos.
`npm run build`: correcto; mantiene la advertencia previa de tamano del bundle.

Las pruebas interceptan solicitudes externas. No se probaron escrituras contra
Supabase real ni Safari de un iPhone fisico.
