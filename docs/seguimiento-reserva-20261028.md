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
2. Cuando acuerdan la reserva, crearla pendiente con fechas, cliente y precio.
   Las fechas quedan ocupadas aunque todavia no exista un pago.
3. Desde la ficha, preparar el detalle o marcar Ya lo envie si se mando afuera.
4. Registrar sena y confirmar realiza ambas operaciones juntas. Un error revierte
   la operacion; un reintento no duplica el pago.
5. Preparar el voucher y marcarlo enviado desde la ficha o desde el mensaje guardado.

Al asignar un cliente a una reserva pendiente, Guardar abre el cobro si ya tiene
precio; se puede cerrar sin registrar nada. Si falta precio, lleva a Pagos.
El resumen de pasos no obliga a completar pantallas en orden ni crea cotizaciones.
Booking/Airbnb conservan su gestion manual y sus condiciones de cobro.
