# Acceso administrativo y solicitudes

## Reservas directas sobre cierres importados

Ejecutar completo `supabase/migrations/20261001_solicitudes_sobre_cierres.sql`.
Solo agrega una funcion administrativa; no cambia fechas al instalarla.
El formulario publico admite consultas aunque haya fechas ocupadas.
Al preparar la sena se revisa disponibilidad: un cierre importado sin cliente,
precio ni pagos permite continuar con autorizacion explicita. Una reserva real
o cierre manual sigue bloqueando el flujo. Al confirmar el pago se vuelve a
comprobar todo y se solicita autorizar los cierres actuales. Se conservan las
noches fuera de la estadia. Cierre, reserva y pago se modifican en una sola
transaccion: si falla algo, no se cambia nada. Booking/Airbnb no se modifican.

## Si el formulario y la confirmacion ya funcionan

Ejecutar solamente `supabase/migrations/20260930_solicitudes_reservas_eliminadas.sql`.
No repetir los INSERT de administrador ni las migraciones anteriores.
Esta actualizacion conserva la solicitud como historial en Eliminadas cuando
se borra su reserva. Tambien corrige solicitudes confirmadas cuya reserva ya
fue borrada. No elimina reservas, clientes ni pagos.
Luego recargar la app. Inicio muestra las solicitudes abiertas para revisar.

## Si el acceso ya funciona

Si ya ejecutaste `20260930_acceso_y_formulario.sql` y el INSERT con tu correo,
no repitas esos pasos. Solo falta ejecutar completo
`supabase/migrations/20260930_solicitudes_publicas.sql` para el flujo general.
Despues recarga la app y entra en Solicitudes -> Compartir formulario -> Copiar enlace.
No hace falta crear una solicitud ni un cliente antes de compartirlo.

## Activacion

1. La migracion `20260930_solicitudes.sql` ya debe estar instalada, junto con
   `20260914_operacion_reservas.sql` y `20260926_transacciones_seguras.sql`.
2. Ejecutar `supabase/migrations/20260930_acceso_y_formulario.sql` en SQL Editor.
   No borra reservas ni pagos. Cambia permisos de las tablas y RPC de esta app.
   Mantiene el acceso del cron con service_role. Los clientes anonimos antiguos
   dejaran de acceder: coordinar la ejecucion con el despliegue del nuevo codigo.
3. Habilitar el usuario ya creado en Authentication, reemplazando el correo:

```sql
insert into public.administradores (user_id)
select id from auth.users where lower(email) = lower('TU_CORREO_DE_ACCESO')
on conflict do nothing;

select u.email from public.administradores a join auth.users u on u.id=a.user_id;
```

La ultima consulta debe devolver tu correo. No hace falta volver a crear usuario
ni compartir la contrasena. No se permite darse de alta como administrador desde
el navegador. Desactivar registro publico de cuentas en Supabase si no se usa.
Una cuenta creada sin habilitacion tampoco puede leer las tablas de la app.

4. Ejecutar `supabase/migrations/20260930_solicitudes_publicas.sql`.
5. Ingresar en la app y verificar inicio, calendario, cobros y solicitudes.
6. Ejecutar `supabase/setup/verificar_acceso_publico.sql` antes de compartir
   formularios. Si devuelve filas, revisar esos objetos: pueden existir vistas
   o funciones creadas manualmente en Supabase que no estan en este repositorio.
   No se cambian automaticamente para no romper integraciones desconocidas.

El proxy iCal requiere una sesion administradora. En Vercel usa SUPABASE_URL y
SUPABASE_ANON_KEY, o las variables existentes VITE_SUPABASE_URL/VITE_SUPABASE_KEY.
No usar una clave service_role como variable VITE. El cron mantiene sus variables
SUPABASE_SERVICE_ROLE_KEY y CRON_SECRET; no requiere login interactivo.

## Flujo

1. En Solicitudes, pulsar Compartir formulario -> Copiar enlace.
2. Enviar ese enlace general al huesped. Es reutilizable, no requiere crear nada antes.
3. El huesped abre `/consulta/<token>` sin login y carga contacto, fechas y huespedes.
4. Actualizar Solicitudes: la consulta aparece sin departamento ni precio.
5. Asignar departamento y precio -> Guardar y preparar sena. Se revisan reservas
   y cierres de esas fechas y se prepara el detalle con total, 30%, saldo y alias.
6. Verificar la transferencia fuera de la app y confirmar el pago recibido.
   Solo entonces se crea la reserva y se ocupan las fechas. Ante superposicion
   se rechaza la operacion completa, sin pagos ni clientes parciales.
7. En Confirmadas, Voucher de confirmacion prepara un texto con los datos actuales
   de la reserva, pagos efectivamente registrados y saldo para copiar/enviar.
   No envia mensajes automaticamente ni genera un PDF nuevo.

El enlace general permanece igual al volver a copiarlo y sirve para distintos
huespedes. No muestra datos personales previos ni disponibilidad ni precios.
Los envios repetidos por un fallo de red no duplican una misma solicitud.
Se permiten hasta 50 solicitudes nuevas por enlace cada 24 horas. Para pausar
un enlace se puede poner activo=false en solicitud_formularios desde Supabase.

Los enlaces individuales anteriores `/solicitar/<token>` siguen funcionando con
su vencimiento de 7 dias. La interfaz nueva prioriza el enlace general.
Nueva solicitud conserva el alta interna manual como alternativa.

Generar enlaces desde la app publicada (HTTPS). Los enlaces de localhost o
127.0.0.1 solo sirven para pruebas en esa computadora.

Booking/Airbnb siguen bajo gestion manual. No se exporta disponibilidad.
Las tablas antiguas son de un unico negocio compartido entre sus administradores;
esto no implementa aislamiento para empresas independientes. Solicitudes mantiene
ademas la propiedad por usuario del apartado anterior.
