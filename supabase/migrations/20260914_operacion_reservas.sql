begin;

alter table public.reservas
  add column if not exists requiere_sena boolean not null default true,
  add column if not exists modalidad text not null default 'temporal' check (modalidad in ('temporal', 'mensual')),
  add column if not exists recordar_el date;
alter table public.pagos add column if not exists periodo_mes date;

-- Extend existing type constraints without rejecting previously valid values.
do $$
declare c record; t record; value text;
begin
  select ty.oid, ns.nspname, ty.typname, ty.typtype into t
  from pg_attribute a join pg_type ty on ty.oid = a.atttypid join pg_namespace ns on ns.oid = ty.typnamespace
  where a.attrelid = 'public.pagos'::regclass and a.attname = 'tipo';
  if t.typtype = 'e' then
    foreach value in array array['saldo','mensualidad','total'] loop
      execute format('alter type %I.%I add value if not exists %L', t.nspname, t.typname, value);
    end loop;
  end if;
  for c in select conname, pg_get_expr(conbin, conrelid) as expression from pg_constraint
    where conrelid = 'public.pagos'::regclass and contype = 'c'
      and conkey = array[(select attnum from pg_attribute where attrelid = 'public.pagos'::regclass and attname = 'tipo')]::smallint[]
  loop
    execute format('alter table public.pagos drop constraint %I', c.conname);
    execute format('alter table public.pagos add constraint %I check ((%s) or tipo::text in (''saldo'', ''mensualidad'', ''total''))', c.conname, c.expression);
  end loop;
end $$;

do $$
declare c record; t record; value text;
begin
  select ty.oid, ns.nspname, ty.typname, ty.typtype into t
  from pg_attribute a join pg_type ty on ty.oid = a.atttypid join pg_namespace ns on ns.oid = ty.typnamespace
  where a.attrelid = 'public.pagos'::regclass and a.attname = 'metodo';
  if t.typtype = 'e' then
    foreach value in array array['transferencia','efectivo','otro'] loop
      execute format('alter type %I.%I add value if not exists %L', t.nspname, t.typname, value);
    end loop;
  end if;
  for c in select conname, pg_get_expr(conbin, conrelid) as expression from pg_constraint
    where conrelid = 'public.pagos'::regclass and contype = 'c'
      and conkey = array[(select attnum from pg_attribute where attrelid = 'public.pagos'::regclass and attname = 'metodo')]::smallint[]
  loop
    execute format('alter table public.pagos drop constraint %I', c.conname);
    execute format('alter table public.pagos add constraint %I check ((%s) or metodo::text in (''transferencia'', ''efectivo'', ''otro''))', c.conname, c.expression);
  end loop;
end $$;

-- Start tracking cleaning with current/future departures, not the entire historical backlog.
do $$ begin
  if not exists(select 1 from pg_attribute where attrelid = 'public.reservas'::regclass and attname = 'limpieza_completada_para' and not attisdropped) then
    alter table public.reservas add column limpieza_completada_para date;
    update public.reservas set limpieza_completada_para = checkout
    where checkout < (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  end if;
end $$;

create table if not exists public.reserva_historial (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null,
  registrado_at timestamptz not null default now(),
  tabla text not null,
  accion text not null,
  origen text not null,
  usuario_id uuid,
  antes jsonb,
  despues jsonb
);
create index if not exists reserva_historial_reserva_fecha on public.reserva_historial(reserva_id, registrado_at desc);
alter table public.reserva_historial enable row level security;
drop policy if exists historial_reserva_visible on public.reserva_historial;
create policy historial_reserva_visible on public.reserva_historial for select to anon, authenticated
using (exists (select 1 from public.reservas r where r.id = reserva_id));
grant select on public.reserva_historial to anon, authenticated;

create or replace function public.auditar_reserva() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare prev jsonb; next jsonb; rid uuid; source text;
begin
  if tg_op <> 'INSERT' then prev = to_jsonb(old); end if;
  if tg_op <> 'DELETE' then next = to_jsonb(new); end if;
  if prev is not distinct from next then return new; end if;
  rid = case when tg_table_name = 'reservas' then coalesce(next->>'id', prev->>'id')::uuid
    else coalesce(next->>'reserva_id', prev->>'reserva_id')::uuid end;
  source = coalesce(nullif(current_setting('request.headers', true), '')::jsonb->>'x-app-source', 'app');
  insert into public.reserva_historial(reserva_id, tabla, accion, origen, usuario_id, antes, despues)
    values(rid, tg_table_name, tg_op, source, auth.uid(), prev, next);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists reservas_historial on public.reservas;
create trigger reservas_historial after insert or update or delete on public.reservas for each row execute function public.auditar_reserva();
drop trigger if exists pagos_historial on public.pagos;
create trigger pagos_historial after insert or update or delete on public.pagos for each row execute function public.auditar_reserva();

create or replace function public.registrar_cobro(p_reserva uuid, p_pago jsonb, p_confirmar boolean default false)
returns public.pagos language plpgsql security invoker set search_path = public, pg_temp as $$
declare payment public.pagos; saved public.pagos; booking public.reservas;
begin
  select * into booking from public.reservas where id = p_reserva for update;
  if not found or booking.estado in ('cerrada','cancelada') then raise exception 'La reserva no permite registrar pagos.'; end if;
  payment = jsonb_populate_record(null::public.pagos, p_pago);
  if payment.id is null or payment.monto is null or payment.monto <= 0 or round(payment.monto::numeric, 2) <> payment.monto then raise exception 'Importe inválido.'; end if;
  if payment.tipo::text not in ('seña','saldo','total','mensualidad') then raise exception 'Tipo de pago inválido.'; end if;
  if payment.fecha_recibido is null then raise exception 'Falta la fecha de cobro.'; end if;
  if payment.tipo::text = 'mensualidad' and payment.periodo_mes is null then raise exception 'Falta el mes del pago.'; end if;
  if payment.periodo_mes is not null and (payment.periodo_mes < date_trunc('month', booking.checkin)::date or payment.periodo_mes > date_trunc('month', booking.checkout - 1)::date) then raise exception 'El mes está fuera de la estadía.'; end if;
  if payment.tipo::text <> 'mensualidad' then payment.periodo_mes = null; end if;
  insert into public.pagos(id,reserva_id,tipo,monto,fecha_recibido,metodo,periodo_mes,confirmado)
    values(payment.id,p_reserva,payment.tipo,payment.monto,payment.fecha_recibido,payment.metodo,payment.periodo_mes,true)
    on conflict(id) do nothing;
  select * into saved from public.pagos where id = payment.id;
  if not found or saved.reserva_id <> p_reserva or saved.monto <> payment.monto or saved.tipo <> payment.tipo or not saved.confirmado
    or saved.fecha_recibido is distinct from payment.fecha_recibido or saved.metodo is distinct from payment.metodo or saved.periodo_mes is distinct from payment.periodo_mes
    then raise exception 'El intento de pago ya existe con otros datos.'; end if;
  if p_confirmar and booking.estado = 'pendiente' then update public.reservas set estado = 'confirmada' where id = p_reserva; end if;
  return saved;
end $$;

create or replace function public.crear_reserva_con_pago(p_reserva jsonb, p_cliente jsonb default null, p_pago jsonb default null)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare booking public.reservas; person public.clientes; existing public.reservas;
begin
  booking = jsonb_populate_record(null::public.reservas, p_reserva);
  if booking.id is null then raise exception 'Falta el identificador de la operación.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(booking.id::text,0));
  select * into existing from public.reservas where id = booking.id;
  if found then
    if existing.propiedad_id is distinct from booking.propiedad_id or existing.checkin is distinct from booking.checkin or existing.checkout is distinct from booking.checkout or existing.precio_total is distinct from booking.precio_total then
      raise exception 'La operación ya creó una reserva con otros datos. Revisá esa reserva antes de continuar.';
    end if;
    if p_pago is not null and not exists(select 1 from public.pagos where id = (p_pago->>'id')::uuid and reserva_id = existing.id and monto = (p_pago->>'monto')::numeric and confirmado) then
      raise exception 'La reserva ya existe. Registrá el pago desde su ficha.';
    end if;
    return existing.id;
  end if;
  if booking.checkin is null or booking.checkout is null or booking.checkout <= booking.checkin or booking.precio_total is null or booking.precio_total <= 0 then raise exception 'Revisá fechas y precio total.'; end if;
  if exists(select 1 from public.reservas where propiedad_id = booking.propiedad_id and estado <> 'cancelada' and checkin < booking.checkout and checkout > booking.checkin) then raise exception 'Las fechas ya están ocupadas.'; end if;
  if to_regclass('public.bloqueos') is not null then
    if exists(select 1 from public.bloqueos where propiedad_id = booking.propiedad_id and fecha_inicio < booking.checkout and fecha_fin > booking.checkin) then raise exception 'Las fechas tienen un cierre manual.'; end if;
  end if;
  if booking.cliente_id is null then
    person = jsonb_populate_record(null::public.clientes, p_cliente);
    if nullif(trim(person.nombre),'') is null then raise exception 'Falta el nombre del cliente.'; end if;
    insert into public.clientes(nombre,apellido,dni,email,whatsapp,ciudad)
      values(person.nombre,person.apellido,person.dni,person.email,person.whatsapp,person.ciudad) returning id into booking.cliente_id;
  end if;
  insert into public.reservas(id,propiedad_id,cliente_id,canal_origen,checkin,checkout,adultos,menores,mascotas,precio_total,estado,notas_internas,requiere_sena,modalidad)
    values(booking.id,booking.propiedad_id,booking.cliente_id,booking.canal_origen,booking.checkin,booking.checkout,booking.adultos,booking.menores,booking.mascotas,booking.precio_total,booking.estado,booking.notas_internas,coalesce(booking.requiere_sena,true),coalesce(booking.modalidad,'temporal'));
  if p_pago is not null then perform public.registrar_cobro(booking.id,p_pago,false); end if;
  return booking.id;
end $$;
revoke all on function public.registrar_cobro(uuid,jsonb,boolean) from public;
revoke all on function public.crear_reserva_con_pago(jsonb,jsonb,jsonb) from public;
grant execute on function public.registrar_cobro(uuid,jsonb,boolean) to anon, authenticated;
grant execute on function public.crear_reserva_con_pago(jsonb,jsonb,jsonb) to anon, authenticated;
commit;
notify pgrst, 'reload schema';
