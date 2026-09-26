# Activar los cambios seguros

## Primero: base de datos

Ejecutar `supabase/migrations/20260926_transacciones_seguras.sql` en el SQL Editor
de Supabase y despues desplegar la app. El archivo crea dos funciones; ejecutarlo
no elimina reservas ni pagos. Las funciones solo borran cuando la app las invoca.
Puede repetirse. Sin la migracion, la app rechaza las operaciones nuevas: no vuelve
al borrado inseguro anterior.

## Sincronizacion cada 15 minutos con Vercel Hobby

Vercel Hobby limita cada cron nativo a una vez por dia. Se mantiene el cron diario
como respaldo. Supabase puede llamar al mismo endpoint cada 15 minutos sin cambiar
el plan de Vercel. No queda activado por desplegar este codigo.

1. En Vercel, configurar las variables de servidor `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` y volver a desplegar.
   Usar un secreto aleatorio largo; nunca una variable `VITE_` para estos secretos.
2. En Supabase, habilitar Cron (`pg_cron`) y `pg_net` desde Integrations/Extensions.
3. En Supabase Vault, crear dos secretos: `gesell_app_url` con la URL HTTPS publica
   de produccion (sin barra final) y `gesell_cron_secret` con el mismo `CRON_SECRET`
   de Vercel. No usar la service-role key como token del cron.
4. Ejecutar `supabase/setup/sincronizacion_15_minutos.sql` en el SQL Editor.
   El nombre fijo del job evita duplicarlo al repetir el archivo.
5. Comprobar la respuesta HTTP del job: 200 con `ok: true`; 502 indica que algun
   canal fallo y debe revisarse. Un job de pg_cron exitoso solo confirma que se
   encolo la peticion, no que la importacion termino. Revisar `net._http_response`
   o los logs de Vercel para el resultado final. No compartir cuerpos con datos
   de reservas ni tokens.

Para pausar: `select cron.unschedule('gesell-sync-ical-15m');`.
El cron diario de Vercel seguira funcionando mientras se mantenga configurado.

## Limites

- Cada propiedad/canal se confirma completa o se revierte completa. Otra propiedad
  que ya termino correctamente no se revierte si falla la siguiente.
- El plan comprueba reservas y pagos antes de escribir; una edicion concurrente
  cancela el intento y requiere resincronizar.
- Una exportacion iCal no es tiempo real: Booking/Airbnb pueden tardar en actualizarla.
  El bot no debe prometer una reserva garantizada solo por leer disponibilidad.
- No se modifico el webhook del bot (no se encontro su implementacion aqui).
  Queda pendiente incorporar control de antiguedad en ese servicio y verificar
  las ejecuciones en produccion; no se garantiza disponibilidad fresca sin ello.

Documentacion oficial:
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://supabase.com/docs/guides/functions/schedule-functions
- https://supabase.com/docs/guides/database/extensions/pg_net
