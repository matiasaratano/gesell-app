begin;

create or replace function public.solicitud_actualizada()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.estado in ('confirmada','eliminada') and new.cliente_id is distinct from old.cliente_id
    and (to_jsonb(new)-array['cliente_id','updated_at']) is not distinct from (to_jsonb(old)-array['cliente_id','updated_at']) then
    new.updated_at:=clock_timestamp(); return new;
  end if;
  if old.estado='eliminada' then raise exception 'La solicitud fue eliminada. Crea una nueva si es necesario.'; end if;
  if old.estado='confirmada' and (new.estado<>'eliminada' or old.reserva_id is null
    or exists(select 1 from public.reservas where id=old.reserva_id and estado is distinct from 'cancelada')
    or (to_jsonb(new)-array['estado','updated_at']) is distinct from (to_jsonb(old)-array['estado','updated_at'])) then
    raise exception 'La solicitud ya fue confirmada. Edita o cancela la reserva.';
  end if;
  new.updated_at:=clock_timestamp(); return new;
end $$;

-- Eliminar una solicitud solo la aparta del listado: no elimina reservas ni pagos.
create or replace function public.eliminar_solicitud(p_id uuid, p_version timestamptz)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.solicitudes;
begin
  if not public.es_administrador() then raise exception 'Sin acceso administrativo.'; end if;
  select * into s from public.solicitudes where id=p_id for update;
  if not found then raise exception 'La solicitud no esta disponible.'; end if;
  if s.estado='eliminada' then return s.id; end if;
  if s.updated_at is distinct from p_version then raise exception 'La solicitud cambio. Actualiza el listado.'; end if;
  if s.reserva_id is not null then
    perform 1 from public.reservas where id=s.reserva_id for update;
    if exists(select 1 from public.reservas where id=s.reserva_id and estado is distinct from 'cancelada') then
      raise exception 'Cancela la reserva vinculada antes de eliminar la solicitud.';
    end if;
  end if;
  update public.solicitudes set estado='eliminada' where id=s.id;
  return s.id;
end $$;
revoke all on function public.eliminar_solicitud(uuid,timestamptz) from public,anon;
grant execute on function public.eliminar_solicitud(uuid,timestamptz) to authenticated;

commit;
notify pgrst,'reload schema';
