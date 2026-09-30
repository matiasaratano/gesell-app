begin;

-- Habilitar cuentas administrativas desde el SQL Editor, nunca desde el cliente.
create table if not exists public.administradores (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.administradores enable row level security;
revoke all on public.administradores from public, anon, authenticated;
create or replace function public.es_administrador()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.administradores where user_id = auth.uid());
$$;
revoke all on function public.es_administrador() from public, anon;
grant execute on function public.es_administrador() to authenticated;

alter table public.solicitudes add column if not exists datos_recibidos_at timestamptz;
create table if not exists public.solicitud_enlaces (
  solicitud_id uuid primary key references public.solicitudes(id) on delete cascade,
  token_hash text not null unique,
  vence_at timestamptz not null,
  usado_at timestamptz
);
alter table public.solicitud_enlaces enable row level security;
revoke all on public.solicitud_enlaces from public, anon, authenticated;

-- Lista acotada a las tablas usadas por esta app. No toca otros objetos.
do $$ declare nombre text;
begin
  foreach nombre in array array['propiedades','clientes','reservas','pagos','bloqueos','inquilinos','reserva_historial','ical_sync_log','solicitudes'] loop
    if to_regclass('public.' || nombre) is null then continue; end if;
    execute format('revoke all on public.%I from public, anon', nombre);
    execute format('alter table public.%I enable row level security', nombre);
    execute format('drop policy if exists acceso_admin_obligatorio on public.%I', nombre);
    execute format('create policy acceso_admin_obligatorio on public.%I as restrictive to authenticated using (public.es_administrador()) with check (public.es_administrador())', nombre);
    if nombre in ('propiedades','clientes','reservas','pagos','bloqueos','inquilinos') then
      execute format('grant select,insert,update,delete on public.%I to authenticated', nombre);
      execute format('drop policy if exists gestion_admin on public.%I', nombre);
      execute format('create policy gestion_admin on public.%I to authenticated using (public.es_administrador()) with check (public.es_administrador())', nombre);
    elsif nombre in ('reserva_historial','ical_sync_log') then
      execute format('grant select on public.%I to authenticated', nombre);
      execute format('drop policy if exists lectura_admin on public.%I', nombre);
      execute format('create policy lectura_admin on public.%I for select to authenticated using (public.es_administrador())', nombre);
    end if;
  end loop;
end $$;

do $$ begin
  if to_regclass('public.pagos_numero_recibo_seq') is not null then
    revoke all on sequence public.pagos_numero_recibo_seq from public, anon;
    grant usage on sequence public.pagos_numero_recibo_seq to authenticated, service_role;
  end if;
end $$;

revoke execute on function public.crear_reserva_con_pago(jsonb,jsonb,jsonb), public.registrar_cobro(uuid,jsonb,boolean), public.confirmar_solicitud(uuid,timestamptz,jsonb), public.eliminar_reserva_segura(uuid), public.aplicar_sincronizacion_ical(uuid,text,jsonb,jsonb) from public, anon;
grant execute on function public.crear_reserva_con_pago(jsonb,jsonb,jsonb), public.registrar_cobro(uuid,jsonb,boolean), public.confirmar_solicitud(uuid,timestamptz,jsonb), public.eliminar_reserva_segura(uuid), public.aplicar_sincronizacion_ical(uuid,text,jsonb,jsonb) to authenticated, service_role;

create or replace function public.crear_enlace_solicitud(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare s public.solicitudes; token text;
begin
  if not public.es_administrador() then raise exception 'Sin acceso administrativo.'; end if;
  select * into s from public.solicitudes where id=p_id and owner_id=auth.uid() for update;
  if not found or s.estado <> 'abierta' then raise exception 'Solicitud no disponible.'; end if;
  if s.cliente_id is not null then raise exception 'Esta solicitud ya usa un cliente guardado. Sus datos se editan en Clientes.'; end if;
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
  insert into public.solicitud_enlaces(solicitud_id,token_hash,vence_at)
    values(s.id,encode(sha256(convert_to(token,'UTF8')),'hex'),now()+interval '7 days')
    on conflict(solicitud_id) do update set token_hash=excluded.token_hash,vence_at=excluded.vence_at,usado_at=null;
  return token;
end $$;

create or replace function public.ver_formulario_solicitud(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare resultado jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Enlace no disponible.'; end if;
  select jsonb_build_object('alojamiento',p.nombre,'checkin',s.checkin,'checkout',s.checkout,'adultos',s.adultos,'menores',s.menores)
    into resultado from public.solicitud_enlaces e join public.solicitudes s on s.id=e.solicitud_id
    join public.propiedades p on p.id=s.propiedad_id
    join public.administradores a on a.user_id=s.owner_id
    where e.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and e.vence_at>now()
      and e.usado_at is null and s.estado='abierta' and s.cliente_id is null;
  if resultado is null then raise exception 'Enlace no disponible.'; end if;
  return resultado;
end $$;

create or replace function public.enviar_formulario_solicitud(p_token text,p_datos jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare enlace public.solicitud_enlaces; s public.solicitudes; datos jsonb; k text; valor text; sid uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Enlace no disponible.'; end if;
  select solicitud_id into sid from public.solicitud_enlaces where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if sid is null then raise exception 'Enlace no disponible.'; end if;
  -- Mismo orden de bloqueo que regenerar enlace y confirmar pago.
  select * into s from public.solicitudes where id=sid for update;
  select * into enlace from public.solicitud_enlaces where solicitud_id=sid for update;
  if enlace.token_hash <> encode(sha256(convert_to(p_token,'UTF8')),'hex') or enlace.vence_at<=now()
    or s.estado <> 'abierta' or s.cliente_id is not null
    or not exists(select 1 from public.administradores where user_id=s.owner_id)
    then raise exception 'Enlace no disponible.'; end if;
  if enlace.usado_at is not null then return true; end if;
  if p_datos is null or jsonb_typeof(p_datos)<>'object' or octet_length(p_datos::text)>4096 then raise exception 'Datos invalidos.'; end if;
  datos := '{}'::jsonb;
  foreach k in array array['nombre','apellido','dni','whatsapp','email','domicilio','ciudad'] loop
    valor := btrim(coalesce(p_datos->>k,''));
    if (p_datos ? k and jsonb_typeof(p_datos->k)<>'string') or length(valor)>(case when k='email' then 254 else 150 end) then raise exception 'Datos invalidos.'; end if;
    if k in ('nombre','apellido','dni','whatsapp','email') and valor='' then raise exception 'Completa los datos obligatorios.'; end if;
    datos := datos || jsonb_build_object(k,valor);
  end loop;
  if datos->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Email invalido.'; end if;
  update public.solicitudes set datos_cliente=datos,datos_recibidos_at=now() where id=s.id;
  update public.solicitud_enlaces set usado_at=now() where solicitud_id=s.id;
  return true;
end $$;
revoke all on function public.crear_enlace_solicitud(uuid) from public, anon;
grant execute on function public.crear_enlace_solicitud(uuid) to authenticated;
revoke all on function public.ver_formulario_solicitud(text) from public;
revoke all on function public.enviar_formulario_solicitud(text,jsonb) from public;
grant execute on function public.ver_formulario_solicitud(text), public.enviar_formulario_solicitud(text,jsonb) to anon, authenticated;
commit;
notify pgrst, 'reload schema';
