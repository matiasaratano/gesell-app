begin;

-- Replace only the selected interval, atomically with the client and optional payment.
create or replace function public.crear_reserva_dentro_cierre(
  p_reserva jsonb, p_cliente jsonb, p_pago jsonb, p_cierre_id uuid, p_cierres jsonb
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  b public.reservas;
  origen public.reservas;
  r public.reservas;
  actual jsonb;
  esperado jsonb;
begin
  b := jsonb_populate_record(null::public.reservas, p_reserva);
  if b.id is null then raise exception 'Falta el identificador de la operacion.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(b.id::text,0));
  -- A retry must succeed even if the original closure was fully replaced.
  if exists(select 1 from public.reservas where id=b.id) then
    return public.crear_reserva_con_pago(p_reserva,p_cliente,p_pago);
  end if;
  if b.checkin is null or b.checkout is null or b.checkout <= b.checkin
    or b.estado is null or b.estado not in ('pendiente','confirmada','finalizada')
    or b.canal_origen is null or b.canal_origen not in ('directo','whatsapp','mail','telefono') then
    raise exception 'Revisa las fechas, el estado y el canal de la reserva directa.';
  end if;
  perform 1 from public.propiedades where id=b.propiedad_id for update;
  if not found then raise exception 'Alojamiento inexistente o sin permisos.'; end if;
  perform 1 from public.reservas where propiedad_id=b.propiedad_id order by id for update;
  perform 1 from public.pagos where reserva_id in
    (select id from public.reservas where propiedad_id=b.propiedad_id) order by id for update;
  select * into origen from public.reservas where id=p_cierre_id and propiedad_id=b.propiedad_id;
  if not found or origen.estado is distinct from 'cerrada'
    or origen.checkin > b.checkin or origen.checkout < b.checkout then
    raise exception 'El cierre cambio o las fechas quedan fuera de su rango. Volve a revisarlo.';
  end if;
  if exists(select 1 from public.reservas o where o.propiedad_id=b.propiedad_id
    and o.estado <> 'cancelada' and o.checkin < b.checkout and o.checkout > b.checkin
    and (o.estado is distinct from 'cerrada' or o.canal_origen is null
      or o.canal_origen not in ('booking','airbnb') or o.cliente_id is not null
      or coalesce(o.precio_total,0) <> 0 or exists(select 1 from public.pagos p where p.reserva_id=o.id))) then
    raise exception 'Las fechas estan ocupadas por una reserva o un cierre gestionado.';
  end if;
  if jsonb_typeof(p_cierres) is distinct from 'array' then
    raise exception 'Revisa y autoriza los cierres antes de guardar.';
  end if;
  select jsonb_agg(jsonb_build_object('id',id,'checkin',checkin,'checkout',checkout,'canal_origen',canal_origen) order by id)
    into actual from public.reservas where propiedad_id=b.propiedad_id and estado='cerrada'
    and checkin < b.checkout and checkout > b.checkin;
  select jsonb_agg(value order by value->>'id') into esperado from jsonb_array_elements(p_cierres);
  if actual is null or actual is distinct from esperado then
    raise exception 'Los cierres cambiaron. Volve a verificar las fechas y autorizar los cierres.';
  end if;
  for r in select * from public.reservas where propiedad_id=b.propiedad_id and estado='cerrada'
    and checkin < b.checkout and checkout > b.checkin loop
    if r.checkin < b.checkin and r.checkout > b.checkout then
      update public.reservas set checkout=b.checkin where id=r.id;
      if not found then raise exception 'No se pudo ajustar el cierre.'; end if;
      insert into public.reservas(id,propiedad_id,canal_origen,estado,checkin,checkout,notas_internas)
        values(gen_random_uuid(),r.propiedad_id,r.canal_origen,'cerrada',b.checkout,r.checkout,r.notas_internas);
    elsif r.checkin < b.checkin then
      update public.reservas set checkout=b.checkin where id=r.id;
      if not found then raise exception 'No se pudo ajustar el cierre.'; end if;
    elsif r.checkout > b.checkout then
      update public.reservas set checkin=b.checkout where id=r.id;
      if not found then raise exception 'No se pudo ajustar el cierre.'; end if;
    else
      delete from public.reservas where id=r.id;
      if not found then raise exception 'No se pudo reemplazar el cierre.'; end if;
    end if;
  end loop;
  return public.crear_reserva_con_pago(p_reserva,p_cliente,p_pago);
end $$;
revoke all on function public.crear_reserva_dentro_cierre(jsonb,jsonb,jsonb,uuid,jsonb) from public, anon;
grant execute on function public.crear_reserva_dentro_cierre(jsonb,jsonb,jsonb,uuid,jsonb) to authenticated;
commit;
notify pgrst, 'reload schema';
