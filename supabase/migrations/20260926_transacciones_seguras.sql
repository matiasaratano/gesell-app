begin;

-- Invoker preserves the caller's existing RLS permissions. Errors roll back payments too.
create or replace function public.eliminar_reserva_segura(p_reserva_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from public.reservas where id = p_reserva_id for update;
  if not found then raise exception 'La reserva no existe o no tenes permiso para eliminarla.'; end if;
  delete from public.pagos where reserva_id = p_reserva_id;
  delete from public.reservas where id = p_reserva_id;
  if not found then raise exception 'No se pudo eliminar la reserva. No se modificaron sus pagos.'; end if;
end;
$$;

-- Validate the complete property snapshot after locking. Never overwrite a concurrent edit.
create or replace function public.aplicar_sincronizacion_ical(
  p_propiedad_id uuid, p_canal text, p_esperado jsonb, p_operaciones jsonb
) returns void language plpgsql security invoker set search_path = public as $$
declare
  actual jsonb;
  op jsonb;
  datos jsonb;
  fila public.reservas%rowtype;
  nueva public.reservas%rowtype;
begin
  if p_canal is null or p_canal not in ('booking', 'airbnb')
    or jsonb_typeof(p_esperado) is distinct from 'array'
    or jsonb_typeof(p_operaciones) is distinct from 'array' then
    raise exception 'Plan iCal invalido.';
  end if;
  perform 1 from public.propiedades where id = p_propiedad_id for update;
  if not found then raise exception 'Alojamiento inexistente o sin permisos.'; end if;
  perform 1 from public.reservas where propiedad_id = p_propiedad_id order by id for update;
  perform 1 from public.pagos p where p.reserva_id in
    (select id from public.reservas where propiedad_id = p_propiedad_id) order by p.id for update;

  select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('pagos',
    (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
     from public.pagos p where p.reserva_id = r.id)) order by r.id), '[]'::jsonb)
  into actual from public.reservas r where r.propiedad_id = p_propiedad_id;
  if actual is distinct from p_esperado then
    raise exception 'Las reservas o sus pagos cambiaron durante la sincronizacion. Volve a sincronizar; no se aplico este intento.';
  end if;

  for op in select value from jsonb_array_elements(p_operaciones) loop
    datos := op->'datos';
    if op->>'accion' in ('update', 'delete') then
      select * into fila from public.reservas where id = (op->>'id')::uuid;
      if not found then raise exception 'El cierre ya no existe.'; end if;
      if fila.propiedad_id <> p_propiedad_id or fila.canal_origen is distinct from p_canal
        or fila.cliente_id is not null or coalesce(fila.precio_total, 0) > 0
        or fila.estado not in ('cerrada', 'pendiente')
        or exists (select 1 from public.pagos where reserva_id = fila.id and monto > 0) then
        raise exception 'La sincronizacion no puede modificar una reserva gestionada.';
      end if;
    end if;
    if op->>'accion' = 'delete' then
      delete from public.reservas where id = fila.id;
      if not found then raise exception 'No se pudo eliminar el cierre.'; end if;
    elsif op->>'accion' in ('insert', 'update') then
      if exists (select 1 from jsonb_object_keys(datos) k
        where k not in ('propiedad_id', 'canal_origen', 'estado', 'checkin', 'checkout', 'notas_internas')) then
        raise exception 'Campos no permitidos en el plan iCal.';
      end if;
      if op->>'accion' = 'insert' then
        nueva := jsonb_populate_record(null::public.reservas, datos);
      else
        nueva := jsonb_populate_record(fila, datos);
      end if;
      if nueva.propiedad_id is distinct from p_propiedad_id
        or nueva.canal_origen is distinct from p_canal
        or nueva.estado is null or nueva.estado not in ('cerrada', 'pendiente')
        or nueva.checkin is null or nueva.checkout is null or nueva.checkout <= nueva.checkin then
        raise exception 'Fechas o datos iCal invalidos.';
      end if;
      if op->>'accion' = 'insert' then
        insert into public.reservas (id, propiedad_id, canal_origen, estado, checkin, checkout, notas_internas)
        values ((op->>'id')::uuid, p_propiedad_id, nueva.canal_origen, nueva.estado,
          nueva.checkin, nueva.checkout, nueva.notas_internas);
      else
        update public.reservas set checkin = nueva.checkin, checkout = nueva.checkout,
          estado = nueva.estado, notas_internas = nueva.notas_internas where id = fila.id;
        if not found then raise exception 'No se pudo actualizar el cierre.'; end if;
      end if;
    else
      raise exception 'Operacion iCal desconocida.';
    end if;
  end loop;
end;
$$;

revoke all on function public.eliminar_reserva_segura(uuid) from public;
revoke all on function public.aplicar_sincronizacion_ical(uuid, text, jsonb, jsonb) from public;
grant execute on function public.eliminar_reserva_segura(uuid) to anon, authenticated, service_role;
grant execute on function public.aplicar_sincronizacion_ical(uuid, text, jsonb, jsonb) to anon, authenticated, service_role;
commit;
notify pgrst, 'reload schema';
