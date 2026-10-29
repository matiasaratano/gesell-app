# Seguimiento de la reserva

Las cotizaciones siguen siendo mensajes manuales sin crear clientes ni reservas.
Una reserva pendiente ya ocupa fechas. Registrar una sena contabilizada la confirma.

## Activacion

Despues de la migracion de gestion que ya esta aplicada, ejecutar completo:

`supabase/migrations/20261028_seguimiento_reserva.sql`

Es un archivo adicional: no hace falta repetir el SQL anterior. Se puede volver
a ejecutar. Agrega dos fechas de seguimiento y un disparador para confirmar la
reserva al contabilizar una sena. No cambia estados ni pagos anteriores al ejecutarse.
No aplica una sena del 30% automaticamente ni cambia la disponibilidad de plataformas.

La app manda tambien la confirmacion al registrar una sena mediante el cobro
existente, por lo que ese circuito sigue funcionando durante la actualizacion.
El disparador cubre otros caminos que insertan pagos, incluida Nueva reserva.

## Recorrido

1. Cotizar por WhatsApp como hasta ahora, sin guardar cada consulta.
2. Preparar el detalle de pago desde Mensajes, antes de dar de alta la reserva.
3. Una vez recibida la sena, crear la reserva y registrar el pago recibido.
   Se conserva la opcion de reserva pendiente para las excepciones: ocupa fechas.
4. Registrar sena y confirmar realiza ambas operaciones juntas. Un error revierte
   la operacion; un reintento no duplica el pago.
5. Preparar el voucher y marcarlo enviado desde la ficha o desde el mensaje guardado.

Al asignar un cliente a una reserva pendiente, Guardar abre el cobro si ya tiene
precio; se puede cerrar sin registrar nada. Si falta precio, lleva a Pagos.
La ficha muestra datos, importes y una proxima accion, sin repetir cotizacion ni
detalle previo al pago. El voucher usa la misma plantilla que Mensajes y permite
marcar un envio manual. Las versiones ya guardadas se conservan sin cambios.
Booking/Airbnb conservan su gestion manual y sus condiciones de cobro.
