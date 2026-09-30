begin;
-- Apartado interno con sesion obligatoria. No expone datos a visitantes.
create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  propiedad_id uuid not null references public.propiedades(id),
  cliente_id uuid references public.clientes(id),
  datos_cliente jsonb not null default '{}'::jsonb check (jsonb_typeof(datos_cliente) = 'object'),
  checkin date not null,
  checkout date not null check (checkout > checkin),
  adultos integer not null default 1 check (adultos > 0),
  menores integer not null default 0 check (menores >= 0),
  precio_total numeric(12,2) not null check (precio_total > 0),
  estado text not null default 'abierta' check (estado in ('abierta','archivada','confirmada')),
  reserva_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.solicitudes enable row level security;
revoke all on public.solicitudes from anon;
grant select, insert, update on public.solicitudes to authenticated;
drop policy if exists solicitudes_propias on public.solicitudes;
create policy solicitudes_propias on public.solicitudes to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function public.solicitud_actualizada()
returns trigger language plpgsql as $$
begin
  if old.estado = 'confirmada' then raise exception 'La solicitud ya fue confirmada. Edita la reserva.'; end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists solicitud_actualizada on public.solicitudes;
create trigger solicitud_actualizada before update on public.solicitudes
  for each row execute function public.solicitud_actualizada();

create or replace function public.confirmar_solicitud(p_id uuid, p_version timestamptz, p_pago jsonb)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare s public.solicitudes; nueva uuid; cliente uuid;
begin
  select * into s from public.solicitudes where id = p_id for update;
  if not found then raise exception 'Solicitud inexistente o sin permisos.'; end if;
  if s.estado = 'confirmada' and s.reserva_id is not null then return s.reserva_id; end if;
  if s.estado <> 'abierta' then raise exception 'La solicitud esta archivada.'; end if;
  if s.updated_at is distinct from p_version then raise exception 'La solicitud cambio. Actualiza los datos antes de confirmar.'; end if;
  if p_pago is null or p_pago->>'tipo' is null or p_pago->>'tipo' not in ('seña','total')
    or nullif(p_pago->>'metodo','') is null or (p_pago->>'monto')::numeric is null
    or (p_pago->>'monto')::numeric <= 0 or (p_pago->>'monto')::numeric > s.precio_total
    then raise exception 'Revisa el pago recibido.'; end if;
  if p_pago->>'tipo' = 'total' and (p_pago->>'monto')::numeric <> s.precio_total then
    raise exception 'El pago total debe coincidir con el precio acordado.';
  end if;
  perform 1 from public.propiedades where id = s.propiedad_id for update;
  if not found then raise exception 'Alojamiento inexistente o sin permisos.'; end if;
  nueva := public.crear_reserva_con_pago(jsonb_build_object(
    'id',s.id,'propiedad_id',s.propiedad_id,'cliente_id',s.cliente_id,
    'checkin',s.checkin,'checkout',s.checkout,'adultos',s.adultos,'menores',s.menores,
    'mascotas',false,'precio_total',s.precio_total,'estado','confirmada',
    'canal_origen','directo','modalidad','temporal','requiere_sena',true
  ), s.datos_cliente, p_pago);
  if s.cliente_id is null then
    select cliente_id into cliente from public.reservas where id = nueva;
    update public.clientes set domicilio = nullif(s.datos_cliente->>'domicilio','') where id = cliente;
  end if;
  update public.solicitudes set estado = 'confirmada', reserva_id = nueva where id = s.id;
  return nueva;
end $$;
revoke all on function public.confirmar_solicitud(uuid,timestamptz,jsonb) from public, anon;
grant execute on function public.confirmar_solicitud(uuid,timestamptz,jsonb) to authenticated;
commit;
notify pgrst, 'reload schema';
