# Relevamiento funcional y visual

Fecha: 26/09/2026. Proyecto: gesell-app.

## Conclusion

La app permite completar los circuitos principales, pero no corresponde considerarla libre de fallos ni lista para ofrecer a terceros. Se corrigieron inconsistencias visuales y errores reproducibles. Antes de sumar funciones, conviene cerrar los riesgos de operaciones incompletas y disponibilidad desactualizada.

## Actualizacion: correcciones prioritarias

Implementadas despues del relevamiento, pendientes de activar en Supabase:

- Borrado de reservas y pagos en una unica transaccion con control de permisos.
- Reconciliacion y reemplazos iCal en una unica transaccion por propiedad/canal.
  Se conserva la logica existente de proteccion y recorte. El plan se prepara sin
  escrituras y se rechaza si cambiaron reservas o pagos durante la descarga.
- Errores de ambos canales visibles; el cron responde 502 si algun feed falla y
  denuncia enlaces invalidos, en lugar de omitirlos silenciosamente.
- Descarga iCal con limite de espera de 15 segundos.
- Configuracion opcional de Supabase Cron cada 15 minutos para Vercel Hobby.
  No se activo en produccion; el cron nativo diario se conserva como respaldo.

Aplicar `supabase/migrations/20260926_transacciones_seguras.sql` antes de desplegar.
Ver `docs/activar-sincronizacion.md`. La migracion crea funciones, no borra datos
al ejecutarse. `npm run test:sql` verifica los rollbacks en PostgreSQL embebido.
Verificacion de esta correccion: 40 pruebas unitarias y 6 pruebas SQL aprobadas,
compilacion correcta y recorrido de 11 vistas en 3 anchos. El recorrido movil
incluye fallo y exito del borrado transaccional con datos simulados.

Quedan pendientes el control persistente de antiguedad para el bot, comprobar el
cron en produccion, y los hallazgos medios/tecnicos que siguen. `npm audit` tambien
reporta 14 alertas de dependencias (9 altas); no se hizo una actualizacion masiva
de librerias dentro de este cambio transaccional. Requiere una pasada dedicada
para distinguir vulnerabilidades de herramientas/SSR de las rutas usadas aqui.

## Hallazgos originales, por prioridad

### Alta: eliminar una reserva puede borrar sus pagos aunque la reserva no se elimine

En `src/pages/Admin.jsx`, `CRUDReservas.eliminar` borra primero los pagos y luego la reserva con dos solicitudes independientes. Si la segunda falla por permisos, red o restricciones, la reserva permanece sin sus pagos. El control de errores actual informa el fallo, pero no revierte el primer borrado.

Recomendacion: una operacion transaccional en Supabase; priorizar cancelar antes que borrar reservas con movimientos. No se ejercito este borrado sobre datos reales ni se modifico la base durante la auditoria.

### Alta: el reemplazo de eventos iCal tampoco es transaccional

En `src/lib/ical-sync.js`, al cambiar fechas de un evento importado, se eliminan solapamientos no gestionados y despues se inserta el reemplazo. Si la insercion falla, se puede perder temporalmente el bloqueo anterior. Las reservas gestionadas tienen protecciones y las pruebas existentes las verifican, pero eso no convierte el reemplazo en una transaccion.

Recomendacion: reconciliacion atomica por propiedad/canal y reporte persistente del ultimo resultado. Requiere trabajo de base de datos; no se improviso un cambio destructivo en este relevamiento.

### Alta operativa: la configuracion de sincronizacion automatica es diaria

`vercel.json` configura `0 9 * * *`, una ejecucion diaria a las 09:00 UTC. La sincronizacion al abrir la app o ejecutarla manualmente es adicional. No se verifico el despliegue ni el historial del cron en produccion.

Si el bot usa la disponibilidad de Supabase, puede consultar datos antiguos entre sincronizaciones. Conviene mostrar la antiguedad por canal y definir una frecuencia compatible con el alojamiento del servidor. El comentario incorrecto que decia "cada hora" fue corregido, pero no se cambio la frecuencia sin verificar el entorno de despliegue.

### Media: las plantillas generales y los recibos mantienen condiciones fijas

`GeneradorMensajes.jsx` incluye sena del 30%, plazos de 48 horas y otras condiciones escritas en las plantillas. `Recibos.jsx` tambien etiqueta la sena como 30%. No siempre describen una reserva mensual, una de Booking o un pago acordado de otra manera.

La ficha de reserva dispone de un detalle basado en sus cobros. Siguiente mejora: emitir recibo desde un pago seleccionado y parametrizar las condiciones por reserva/canal. No se cambiaron tus politicas comerciales automaticamente.

### Media: errores de carga y accesibilidad aun no son uniformes en todas las pantallas

Inicio y Reportes ya distinguen un fallo de carga de una lista vacia. Algunos formularios antiguos todavia tratan consultas fallidas como listas vacias. Tambien quedan etiquetas de formulario no asociadas programaticamente a sus campos y resultados de busqueda que dependen del clic.

Recomendacion: revisar estos estados por componente, con pruebas de teclado y lector de pantalla. La prueba actual no es una certificacion de accesibilidad.

### Tecnica: lint y peso del paquete

El lint completo mantiene 26 errores y 1 advertencia en pantallas antiguas (variables sin uso y reglas de hooks). No se desactivaron reglas para ocultarlos. La compilacion pasa, pero avisa por un paquete principal mayor a 500 kB. Conviene limpiar componentes obsoletos y cargar las secciones bajo demanda en una iteracion separada.

### Antes de ofrecerla a terceros

Revisar autenticacion, permisos/RLS, separacion de datos por propietario y restauracion de respaldos. La auditoria no inspecciono las politicas reales de Supabase ni las claves del despliegue; no afirma que esos controles esten configurados o ausentes en produccion.

## Correcciones realizadas

- Base visual compartida: tipografia del sistema, colores principales, fondos neutros, campos legibles y foco de teclado visible.
- Tareas para ordenar: titulos y acciones con jerarquia consistente; tareas futuras diferenciadas sin parecer pendientes actuales.
- Nueva reserva: pasos y campos sin desborde en pantallas chicas; error de cliente dentro del formulario en lugar de alert nativo.
- Administracion: acciones con ajuste de linea y formularios responsivos.
- Mensajes y Recibos: interfaz alineada con la app; se conserva la tipografia propia del documento imprimible.
- Reportes: metricas responsivas, tablas con desplazamiento interno, carga paginada, proteccion frente a respuestas atrasadas y errores con reintento.
- Reportes: canales y total usan el mismo prorrateo por fechas. Los precios numericos recibidos como texto no se concatenan. La metrica aclara que son ingresos estimados, no dinero cobrado.
- Inicio: falla de lectura visible, sin aparentar cero reservas; enlace de WhatsApp separado del enlace de reserva; estados que no se recortan en pantalla chica.
- Recibos: direccion correcta al copiar; cliente ya seleccionado no se inserta otra vez; centavos conservados en letras y formato numerico; estilos de impresion activos hasta finalizar el dialogo.
- Mensajes: validacion de fechas/importes antes de generar cotizacion o detalle; manejo de error al copiar.
- Confirmaciones: dialogo compartido, capa superior, foco inicial en Cancelar y cierre con Escape. No quedan llamadas a `alert()` o `confirm()` nativos en `src`.
- Cron: rechazo de llamadas si falta `CRON_SECRET`, ademas de rechazo de credenciales incorrectas.

## Pruebas realizadas

- 36 pruebas unitarias aprobadas: calendarios, proteccion iCal, cobros, mensualidades, pendientes, prorrateo de reportes y autenticacion del cron.
- 11 vistas recorridas a 1440, 390 y 320 px: Inicio, Calendario, Nueva reserva, Cobros, ficha de reserva, Mensajes, Recibos, Administracion de propiedades/reservas/clientes y Reportes.
- 33 combinaciones vista/tamano sin desborde horizontal del documento ni errores JavaScript en la pasada final. Las tablas y la linea temporal conservan desplazamiento interno intencional.
- Cancelar borrados desde lista y editor, cierre con Escape y verificacion de dialogo en capa superior.
- Validacion de cliente faltante sin popup nativo; cotizacion valida e invalida; navegacion por tipos de mensaje.
- Seleccionar cliente para recibo sin habilitar un alta duplicada; copia de direccion; importe con centavos; emulacion de impresion sin navegacion ni formulario visibles.
- Cambio de mes y de grilla/linea temporal del calendario.
- Fallos simulados de lectura y reintento en Inicio y Reportes.
- Regresion del circuito mensual: carga de meses, pago parcial/completo, ajuste, deteccion de cambio concurrente, importe precargado, Booking y posponer/reactivar.
- Compilacion de produccion y revision de espacios del diff.

## Alcance y limites

Todas las pruebas de escritura del navegador usaron datos ficticios. Las solicitudes externas fueron simuladas o bloqueadas: no se enviaron mensajes, no se modificaron reservas reales y no se ejecuto SQL en Supabase.

La verificacion movil se hizo con Chrome en distintos tamanos, no con Safari en un iPhone fisico. La impresion fue emulada, no se certifico una impresora real. No se comprobo la disponibilidad real de Airbnb/Booking, el parser externo de fichas, webhooks del bot ni los trabajos de Vercel en produccion.

## Repetir las pruebas

Unitarias: `npm test`.

Interfaz: iniciar Vite en un puerto libre y ejecutar `AUDIT_URL=http://127.0.0.1:PUERTO npm run test:ui`. El recorrido bloquea o simula toda solicitud externa. Usa Playwright y Chrome instalados en este equipo; admite `PLAYWRIGHT_MODULE` y `CHROME_PATH` para otras instalaciones.

Capturas y resultados: `/tmp/gesell-audit-final/` en esta ejecucion. `AUDIT_OUTPUT` permite cambiar la carpeta de salida.

## Orden recomendado

1. Operaciones transaccionales para borrado y reconciliacion iCal.
2. Antiguedad visible de disponibilidad y monitoreo de sincronizacion para el bot.
3. Recibo generado desde el pago y condiciones de mensajes por reserva.
4. Navegacion movil mas compacta y revision de accesibilidad.
5. Autenticacion, aislamiento y respaldos verificados antes de comercializar.
