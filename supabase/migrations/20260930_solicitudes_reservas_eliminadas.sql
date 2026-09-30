begin;
alter table public.solicitudes drop constraint if exists solicitudes_estado_check;
alter table public.solicitudes add constraint solicitudes_estado_check
  check (estado in ('abierta','archivada','confirmada','eliminada'));

create or replace function public.solicitud_actualizada()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.estado = 'eliminada' then
    raise exception 'La reserva vinculada fue eliminada. Crea una nueva solicitud si es necesario.';
  end if;
  if old.estado = 'confirmada' then
    -- Solo se permite conservar el historial de una reserva que ya no existe.
    if new.estado <> 'eliminada' or old.reserva_id is null
      or exists(select 1 from public.reservas where id=old.reserva_id)
      or (to_jsonb(new)-array['estado','updated_at']) is distinct from (to_jsonb(old)-array['estado','updated_at']) then
      raise exception 'La solicitud ya fue confirmada. Edita la reserva.';
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;

create or replace function public.solicitud_reserva_eliminada()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.solicitudes set estado='eliminada'
    where reserva_id=old.id and estado='confirmada';
  return old;
end $$;
revoke all on function public.solicitud_reserva_eliminada() from public, anon, authenticated;
drop trigger if exists reserva_elimina_solicitud on public.reservas;
create trigger reserva_elimina_solicitud after delete on public.reservas
  for each row execute function public.solicitud_reserva_eliminada();

-- Corrige tambien las solicitudes cuya reserva se borro antes de esta migracion.
update public.solicitudes s set estado='eliminada'
where s.estado='confirmada' and s.reserva_id is not null
  and not exists(select 1 from public.reservas r where r.id=s.reserva_id);
commit;
notify pgrst, 'reload schema';
