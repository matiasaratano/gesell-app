begin;

-- No se generan deudas ni se modifican pagos existentes.
create or replace function public.plan_mensual_valido(plan jsonb)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare cuota jsonb; meses text[] := '{}'; mes text; importe numeric;
begin
  if jsonb_typeof(plan) is distinct from 'array' then return false; end if;
  for cuota in select value from jsonb_array_elements(plan) loop
    mes := cuota->>'mes';
    if mes is null or mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])-01$' or mes = any(meses) then return false; end if;
    if jsonb_typeof(cuota->'importe') is distinct from 'number' then return false; end if;
    importe := (cuota->>'importe')::numeric;
    if importe <= 0 or round(importe, 2) <> importe then return false; end if;
    if (cuota->>'vencimiento') is null or (cuota->>'vencimiento') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
    perform (cuota->>'vencimiento')::date;
    perform mes::date;
    meses := array_append(meses, mes);
  end loop;
  return true;
exception when others then return false;
end $$;

alter table public.reservas
  add column if not exists plan_mensual jsonb not null default '[]'::jsonb
    check (public.plan_mensual_valido(plan_mensual)),
  add column if not exists booking_contactado_el date;

commit;
notify pgrst, 'reload schema';
