begin;
-- Una consulta del huesped todavia no tiene departamento ni precio asignado.
alter table public.solicitudes alter column propiedad_id drop not null;
alter table public.solicitudes alter column precio_total drop not null;

create table if not exists public.solicitud_formularios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text,'-',''),
  activo boolean not null default true
);
alter table public.solicitud_formularios enable row level security;
revoke all on public.solicitud_formularios from public, anon, authenticated;
alter table public.solicitudes add column if not exists formulario_id uuid references public.solicitud_formularios(id);
alter table public.solicitudes add column if not exists envio_publico_id uuid;
create unique index if not exists solicitud_envio_publico_unico on public.solicitudes(formulario_id,envio_publico_id);

create or replace function public.obtener_formulario_general()
returns text language plpgsql security definer set search_path = '' as $$
declare enlace text;
begin
  if not public.es_administrador() then raise exception 'Sin acceso administrativo.'; end if;
  insert into public.solicitud_formularios(owner_id) values(auth.uid()) on conflict(owner_id) do nothing;
  select token into enlace from public.solicitud_formularios where owner_id=auth.uid() and activo;
  if enlace is null then raise exception 'El formulario esta pausado.'; end if;
  return enlace;
end $$;
revoke all on function public.obtener_formulario_general() from public, anon;
grant execute on function public.obtener_formulario_general() to authenticated;

create or replace function public.ver_formulario_general(p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.solicitud_formularios f join public.administradores a on a.user_id=f.owner_id
    where f.token=p_token and f.activo and length(p_token)=64);
$$;
revoke all on function public.ver_formulario_general(text) from public;
grant execute on function public.ver_formulario_general(text) to anon, authenticated;

create or replace function public.recibir_solicitud_publica(p_token text,p_envio uuid,p_datos jsonb,p_estadia jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare f public.solicitud_formularios; datos jsonb := '{}'::jsonb; k text; valor text;
  ingreso date; salida date; mayores integer; menores integer;
begin
  if p_envio is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Enlace no disponible.'; end if;
  select * into f from public.solicitud_formularios where token=p_token and activo for update;
  if not found or not exists(select 1 from public.administradores where user_id=f.owner_id) then raise exception 'Enlace no disponible.'; end if;
  -- Una respuesta perdida puede reenviarse sin duplicar la solicitud.
  if exists(select 1 from public.solicitudes where formulario_id=f.id and envio_publico_id=p_envio) then return true; end if;
  if (select count(*) from public.solicitudes where formulario_id=f.id and created_at>now()-interval '24 hours') >= 50 then
    raise exception 'Se alcanzo el limite de solicitudes. Contactanos directamente.';
  end if;
  if p_datos is null or jsonb_typeof(p_datos)<>'object' or octet_length(p_datos::text)>4096
    or p_estadia is null or jsonb_typeof(p_estadia)<>'object' or octet_length(p_estadia::text)>1024 then raise exception 'Datos invalidos.'; end if;
  foreach k in array array['nombre','apellido','dni','whatsapp','email','domicilio','ciudad'] loop
    valor := btrim(coalesce(p_datos->>k,''));
    if (p_datos ? k and jsonb_typeof(p_datos->k)<>'string') or length(valor)>(case when k='email' then 254 else 150 end) then raise exception 'Datos invalidos.'; end if;
    if k in ('nombre','apellido','dni','whatsapp','email') and valor='' then raise exception 'Completa los datos obligatorios.'; end if;
    datos := datos || jsonb_build_object(k,valor);
  end loop;
  if datos->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Email invalido.'; end if;
  if coalesce(p_estadia->>'checkin','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(p_estadia->>'checkout','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(p_estadia->>'adultos','') !~ '^[0-9]{1,2}$'
    or coalesce(p_estadia->>'menores','') !~ '^[0-9]{1,2}$' then raise exception 'Revisa fechas y huespedes.'; end if;
  ingreso := (p_estadia->>'checkin')::date; salida := (p_estadia->>'checkout')::date;
  mayores := (p_estadia->>'adultos')::integer; menores := (p_estadia->>'menores')::integer;
  if ingreso<(now() at time zone 'America/Argentina/Buenos_Aires')::date or salida<=ingreso
    or salida>ingreso+730 or mayores not between 1 and 30 or menores not between 0 and 30 then raise exception 'Revisa fechas y huespedes.'; end if;
  insert into public.solicitudes(owner_id,datos_cliente,checkin,checkout,adultos,menores,datos_recibidos_at,formulario_id,envio_publico_id)
    values(f.owner_id,datos,ingreso,salida,mayores,menores,now(),f.id,p_envio);
  return true;
end $$;
revoke all on function public.recibir_solicitud_publica(text,uuid,jsonb,jsonb) from public;
grant execute on function public.recibir_solicitud_publica(text,uuid,jsonb,jsonb) to anon, authenticated;
commit;
notify pgrst, 'reload schema';
