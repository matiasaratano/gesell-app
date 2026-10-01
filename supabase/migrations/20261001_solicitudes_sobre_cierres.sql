begin;

-- Consent applies only to the exact imported closures reviewed by the administrator.
create or replace function public.confirmar_solicitud_sobre_cierres(
  p_id uuid, p_version timestamptz, p_pago jsonb, p_cierres jsonb
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  s public.solicitudes;
  r public.reservas;
  esperado jsonb;
  actual jsonb;
begin
  select * into s from public.solicitudes where id = p_id for update;
  if not found then raise exception 'Solicitud inexistente o sin permisos.'; end if;
  if s.estado = 'confirmada' and s.reserva_id is not null then return s.reserva_id; end if;
  if s.estado <> 'abierta' or s.updated_at is distinct from p_version then
    raise exception 'La solicitud cambio. Actualiza antes de confirmar.';
  end if;
  if jsonb_typeof(p_cierres) is distinct from 'array' or jsonb_array_length(p_cierres) = 0 then
    raise exception 'Revisa y autoriza los cierres antes de confirmar.';
  end if;
  perform 1 from public.propiedades where id = s.propiedad_id for update;
  if not found then raise exception 'Alojamiento inexistente o sin permisos.'; end if;
  perform 1 from public.reservas where propiedad_id = s.propiedad_id order by id for update;
  perform 1 from public.pagos where reserva_id in
    (select id from public.reservas where propiedad_id = s.propiedad_id) order by id for update;

  if exists(select 1 from public.reservas ocupada where ocupada.propiedad_id = s.propiedad_id
    and ocupada.estado <> 'cancelada' and ocupada.checkin < s.checkout and ocupada.checkout > s.checkin
    and (ocupada.estado is distinct from 'cerrada' or ocupada.canal_origen is null
      or ocupada.canal_origen not in ('booking','airbnb') or ocupada.cliente_id is not null
      or coalesce(ocupada.precio_total,0) <> 0
      or exists(select 1 from public.pagos p where p.reserva_id = ocupada.id))) then
    raise exception 'Las fechas estan ocupadas por una reserva o un cierre gestionado. No se puede reemplazar.';
  end if;
  select jsonb_agg(jsonb_build_object('id',id,'checkin',checkin,'checkout',checkout,'canal_origen',canal_origen) order by id)
    into actual from public.reservas where propiedad_id = s.propiedad_id and estado = 'cerrada'
      and checkin < s.checkout and checkout > s.checkin;
  select jsonb_agg(value order by value->>'id') into esperado from jsonb_array_elements(p_cierres);
  if actual is distinct from esperado then
    raise exception 'Los cierres cambiaron. Actualiza y revisa las fechas nuevamente.';
  end if;

  -- Trim only the booked interval; all writes roll back if reservation/payment fails.
  for r in select * from public.reservas where propiedad_id = s.propiedad_id
    and estado = 'cerrada' and checkin < s.checkout and checkout > s.checkin loop
    if r.checkin < s.checkin and r.checkout > s.checkout then
      update public.reservas set checkout = s.checkin where id = r.id;
      if not found then raise exception 'No se pudo ajustar el cierre.'; end if;
      insert into public.reservas(id,propiedad_id,canal_origen,estado,checkin,checkout,notas_internas)
        values(gen_random_uuid(),r.propiedad_id,r.canal_origen,'cerrada',s.checkout,r.checkout,r.notas_internas);
    elsif r.checkin < s.checkin then
      update public.reservas set checkout = s.checkin where id = r.id;
      if not found then raise exception 'No se pudo ajustar el cierre.'; end if;
    elsif r.checkout > s.checkout then
      update public.reservas set checkin = s.checkout where id = r.id;
      if not found then raise exception 'No se pudo ajustar el cierre.'; end if;
    else
      delete from public.reservas where id = r.id;
      if not found then raise exception 'No se pudo reemplazar el cierre.'; end if;
    end if;
  end loop;
  return public.confirmar_solicitud(p_id,p_version,p_pago);
end $$;
revoke all on function public.confirmar_solicitud_sobre_cierres(uuid,timestamptz,jsonb,jsonb) from public, anon;
grant execute on function public.confirmar_solicitud_sobre_cierres(uuid,timestamptz,jsonb,jsonb) to authenticated;
commit;
notify pgrst, 'reload schema';
