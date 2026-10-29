begin;

alter table public.reservas add column if not exists detalle_enviado_el timestamptz;
alter table public.reservas add column if not exists voucher_enviado_el timestamptz;

-- Confirmar solo pagos contabilizados de tipo sena; una anulacion no cambia el estado.
create or replace function public.confirmar_reserva_por_sena()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.confirmado is true and new.tipo::text='seña' and new.monto>0 then
    if tg_op='INSERT' then
      update public.reservas set estado='confirmada' where id=new.reserva_id and estado='pendiente';
    elsif old.confirmado is distinct from true or old.tipo::text is distinct from 'seña'
      or old.reserva_id is distinct from new.reserva_id then
      update public.reservas set estado='confirmada' where id=new.reserva_id and estado='pendiente';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists pago_confirma_reserva_por_sena on public.pagos;
create trigger pago_confirma_reserva_por_sena after insert or update on public.pagos
  for each row execute function public.confirmar_reserva_por_sena();
revoke all on function public.confirmar_reserva_por_sena() from public,anon,authenticated;

commit;
notify pgrst, 'reload schema';
