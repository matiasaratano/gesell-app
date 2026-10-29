# Activar las mejoras de gestion

La app conserva las plantillas manuales y el manejo manual de Booking/Airbnb.
No cambia las etapas de Solicitudes ni las reglas de disponibilidad.

## 1. Supabase

Ejecutar completo, una sola vez, este archivo en el SQL Editor:

`supabase/migrations/20261028_flujo_gestion.sql`

Se puede volver a ejecutar si fuera necesario. Requiere las migraciones anteriores
de la app, incluido acceso administrativo. No cancela reservas ni unifica clientes
al ejecutarse: esas acciones necesitan una confirmacion individual en la app.

Agrega historial de mensajes, cupo diario de IA y registro de unificaciones.
Guarda el domicilio en nuevas altas transaccionales. Protege del borrado a las
reservas que tengan registros de pago; en esos casos se usa Cancelar reserva.

## 2. Servicio IA

El servicio separado vive en `vercel-parser recibo` y se publica como `deptos-proxy`.
Conservar `GROQ_API_KEY` y `GROQ_MODEL` como estan. Agregar en ese proyecto Vercel:

- `SUPABASE_URL`: la misma URL que `VITE_SUPABASE_URL` en la app.
- `SUPABASE_ANON_KEY`: la misma clave publica que `VITE_SUPABASE_KEY` en la app.

No usar la clave service_role. La autorizacion se verifica con la sesion del usuario.
El cupo es de 30 intentos diarios por administrador, contando tambien intentos que
fallen despues de consumir el cupo. El dia se calcula con horario de Buenos Aires.
El contador se guarda en Supabase y no se reinicia al desplegar el servicio.

Publicar primero la app actualizada y despues el servicio IA con esas variables.
La app nueva sigue pudiendo usar el servicio anterior durante la transicion.
El servicio protegido requiere el token que envia la app nueva.

## 3. Uso

- En la ficha: Cancelar reserva pide motivo, conserva pagos y libera las fechas
  en la app. No ejecuta devoluciones ni modifica Booking o Airbnb.
- Mensajes: seguir con la carga manual o elegir una reserva. Generar usa datos
  actuales. Guardar version conserva texto y datos; copiar no marca envio.
  Usar Marcar como enviado despues de enviarlo por el canal elegido.
- Clientes: abrir una ficha guardada, Revisar coincidencias, Comparar, elegir
  los datos a conservar y confirmar que es la misma persona. El registro elegido
  en Comparar es el que se conserva. La otra ficha se elimina solo si todas sus
  referencias se pueden reunir; si algo falla no se guarda ningun cambio.
- Listados: cargan todas las paginas y muestran 50 filas por pagina. Los filtros,
  el orden y el CSV se aplican al conjunto completo, no solo a la pagina visible.

La migracion no recupera domicilios que ya se perdieron: esos clientes se pueden
completar desde Admin o al preparar el recibo.

## Verificacion local

`npm test`, `npm run test:sql`, `npm run test:ui`, `npm run test:gestion`,
`npm run test:solicitudes`, `node tests/gestion-flujo-ui.cjs`.
En el servicio: `node --test api/lib/acceso.test.mjs`.
Las pruebas usan datos ficticios; no escriben en Supabase real.
