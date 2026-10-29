begin;

alter table public.reservas add column if not exists cancelacion_motivo text;
alter table public.reservas add column if not exists cancelada_el timestamptz;

create or replace function public.cancelar_reserva(p_id uuid, p_motivo text)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare r public.reservas;
begin
  if not public.es_administrador() then raise exception 'Sin acceso administrativo.'; end if;
  if nullif(btrim(p_motivo),'') is null or length(p_motivo)>1000 then raise exception 'Indica un motivo de hasta 1000 caracteres.'; end if;
  select * into r from public.reservas where id=p_id for update;
  if not found then raise exception 'La reserva no esta disponible.'; end if;
  if r.estado='cancelada' then return r.id; end if;
  if r.estado='cerrada' then raise exception 'Para un cierre usa Abrir cierre.'; end if;
  update public.reservas set estado='cancelada',cancelacion_motivo=btrim(p_motivo),cancelada_el=now() where id=p_id;
  return p_id;
end $$;
revoke all on function public.cancelar_reserva(uuid,text) from public,anon;
grant execute on function public.cancelar_reserva(uuid,text) to authenticated;

-- Los registros con pagos se cancelan; los datos de prueba sin movimientos se pueden eliminar.
create or replace function public.eliminar_reserva_segura(p_reserva_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  perform 1 from public.reservas where id=p_reserva_id for update;
  if not found then raise exception 'La reserva no existe o no tenes permiso para eliminarla.'; end if;
  if exists(select 1 from public.pagos where reserva_id=p_reserva_id) then
    raise exception 'Esta reserva tiene pagos. Usa Cancelar reserva para conservar los registros.';
  end if;
  if exists(select 1 from public.reserva_mensajes where reserva_id=p_reserva_id) then
    raise exception 'Esta reserva tiene mensajes guardados. Usa Cancelar reserva para conservar el historial.';
  end if;
  delete from public.reservas where id=p_reserva_id;
  if not found then raise exception 'No se pudo eliminar la reserva.'; end if;
end $$;

create table if not exists public.reserva_mensajes (
  id uuid primary key,
  reserva_id uuid not null references public.reservas(id),
  tipo text not null check (tipo in ('detalle','voucher')),
  texto text not null check (length(texto) between 1 and 30000),
  datos jsonb not null,
  creado_el timestamptz not null default now(),
  enviado_el timestamptz,
  creado_por uuid not null default auth.uid()
);
alter table public.reserva_mensajes enable row level security;
revoke all on public.reserva_mensajes from public,anon,authenticated;
grant select,insert,update on public.reserva_mensajes to authenticated;
drop policy if exists gestion_mensajes on public.reserva_mensajes;
create policy gestion_mensajes on public.reserva_mensajes to authenticated using(public.es_administrador()) with check(public.es_administrador());

create or replace function public.guardar_mensaje_reserva(p_id uuid,p_reserva uuid,p_tipo text,p_texto text,p_datos jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.reservas; actuales jsonb; saved public.reserva_mensajes;
begin
  if not public.es_administrador() then raise exception 'Sin acceso administrativo.'; end if;
  select * into r from public.reservas where id=p_reserva for update;
  if not found or r.estado in ('cerrada','cancelada') then raise exception 'La reserva no admite este mensaje.'; end if;
  actuales := jsonb_build_object('reserva',to_jsonb(r),'cliente',(select to_jsonb(c) from public.clientes c where id=r.cliente_id),
    'propiedad',(select to_jsonb(p) from public.propiedades p where id=r.propiedad_id),
    'pagos',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.pagos p where reserva_id=r.id),'[]'::jsonb));
  if actuales is distinct from p_datos then raise exception 'Los datos cambiaron. Actualiza el mensaje antes de guardarlo.'; end if;
  if p_tipo='voucher' and (r.estado not in ('confirmada','finalizada') or not exists(select 1 from public.pagos where reserva_id=r.id and confirmado and monto>0)) then
    raise exception 'Confirma la reserva y registra el pago antes del voucher.';
  end if;
  insert into public.reserva_mensajes(id,reserva_id,tipo,texto,datos) values(p_id,p_reserva,p_tipo,p_texto,p_datos) on conflict(id) do nothing;
  select * into saved from public.reserva_mensajes where id=p_id;
  if saved.reserva_id is distinct from p_reserva or saved.tipo is distinct from p_tipo or saved.texto is distinct from p_texto or saved.datos is distinct from p_datos then
    raise exception 'El mensaje ya se guardo con otros datos.';
  end if;
  return p_id;
end $$;
revoke all on function public.guardar_mensaje_reserva(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.guardar_mensaje_reserva(uuid,uuid,text,text,jsonb) to authenticated;

create or replace function public.mensaje_inmutable() returns trigger language plpgsql as $$
begin
  if (to_jsonb(new)-'enviado_el') is distinct from (to_jsonb(old)-'enviado_el') then raise exception 'El mensaje guardado no se puede editar. Genera otra version.'; end if;
  if new.enviado_el is not null and old.enviado_el is distinct from new.enviado_el and abs(extract(epoch from (new.enviado_el-now())))>300 then raise exception 'Fecha de envio invalida.'; end if;
  return new;
end $$;
drop trigger if exists mensaje_inmutable on public.reserva_mensajes;
create trigger mensaje_inmutable before update on public.reserva_mensajes for each row execute function public.mensaje_inmutable();

create table if not exists public.cliente_unificaciones (
  id uuid primary key default gen_random_uuid(),
  origen uuid not null, destino uuid not null, datos_antes jsonb not null, datos_despues jsonb not null,
  creado_el timestamptz not null default now(), creado_por uuid not null default auth.uid()
);
alter table public.cliente_unificaciones enable row level security;
revoke all on public.cliente_unificaciones from public,anon,authenticated;
grant select,insert on public.cliente_unificaciones to authenticated;
drop policy if exists gestion_unificaciones on public.cliente_unificaciones;
create policy gestion_unificaciones on public.cliente_unificaciones to authenticated using(public.es_administrador()) with check(public.es_administrador());

create or replace function public.solicitud_actualizada()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.estado in ('confirmada','eliminada') and new.cliente_id is distinct from old.cliente_id
    and (to_jsonb(new)-array['cliente_id','updated_at']) is not distinct from (to_jsonb(old)-array['cliente_id','updated_at']) then
    new.updated_at:=clock_timestamp(); return new;
  end if;
  if old.estado='eliminada' then raise exception 'La reserva vinculada fue eliminada. Crea una nueva solicitud si es necesario.'; end if;
  if old.estado='confirmada' and (new.estado<>'eliminada' or old.reserva_id is null
    or exists(select 1 from public.reservas where id=old.reserva_id)
    or (to_jsonb(new)-array['estado','updated_at']) is distinct from (to_jsonb(old)-array['estado','updated_at'])) then
    raise exception 'La solicitud ya fue confirmada. Edita la reserva.';
  end if;
  new.updated_at:=clock_timestamp(); return new;
end $$;

create or replace function public.unificar_clientes(p_origen uuid,p_destino uuid,p_antes jsonb,p_datos jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.clientes; b public.clientes; k text; valor text;
begin
  if not public.es_administrador() then raise exception 'Sin acceso administrativo.'; end if;
  if p_origen is null or p_destino is null or p_origen=p_destino then raise exception 'Elegi dos clientes distintos.'; end if;
  perform 1 from public.clientes where id in(p_origen,p_destino) order by id for update;
  select * into a from public.clientes where id=p_origen;
  select * into b from public.clientes where id=p_destino;
  if a.id is null or b.id is null or jsonb_build_object('origen',to_jsonb(a),'destino',to_jsonb(b)) is distinct from p_antes then
    raise exception 'Los clientes cambiaron. Revisa nuevamente la comparacion.';
  end if;
  if p_datos is null or jsonb_typeof(p_datos)<>'object' or nullif(btrim(p_datos->>'nombre'),'') is null then raise exception 'Falta el nombre del cliente.'; end if;
  foreach k in array array['nombre','apellido','dni','email','whatsapp','domicilio','ciudad','vehiculo_patente','notas'] loop
    valor:=p_datos->>k;
    if (p_datos ? k and jsonb_typeof(p_datos->k) not in ('string','null')) or length(valor)>10000 then raise exception 'Datos invalidos.'; end if;
  end loop;
  update public.clientes set nombre=btrim(p_datos->>'nombre'),apellido=nullif(btrim(p_datos->>'apellido'),''),
    dni=nullif(btrim(p_datos->>'dni'),''),email=nullif(btrim(p_datos->>'email'),''),
    whatsapp=nullif(btrim(p_datos->>'whatsapp'),''),domicilio=nullif(btrim(p_datos->>'domicilio'),''),
    ciudad=nullif(btrim(p_datos->>'ciudad'),''),vehiculo_patente=nullif(btrim(p_datos->>'vehiculo_patente'),''),
    notas=nullif(btrim(p_datos->>'notas'),''),es_repetidor=coalesce(a.es_repetidor,false) or coalesce(b.es_repetidor,false)
    where id=p_destino;
  update public.reservas set cliente_id=p_destino where cliente_id=p_origen;
  update public.solicitudes set cliente_id=p_destino where cliente_id=p_origen;
  insert into public.cliente_unificaciones(origen,destino,datos_antes,datos_despues)
    values(p_origen,p_destino,p_antes,(select to_jsonb(c) from public.clientes c where id=p_destino));
  delete from public.clientes where id=p_origen;
  return p_destino;
end $$;
revoke all on function public.unificar_clientes(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.unificar_clientes(uuid,uuid,jsonb,jsonb) to authenticated;

create table if not exists public.ia_cupos (
  usuario uuid not null references auth.users(id), dia date not null, usados integer not null,
  primary key(usuario,dia)
);
alter table public.ia_cupos enable row level security;
revoke all on public.ia_cupos from public,anon,authenticated;
create or replace function public.consumir_cupo_ia()
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if not public.es_administrador() then raise exception 'Sin acceso administrativo.'; end if;
  insert into public.ia_cupos(usuario,dia,usados) values(auth.uid(),(now() at time zone 'America/Argentina/Buenos_Aires')::date,1)
    on conflict(usuario,dia) do update set usados=public.ia_cupos.usados+1 where public.ia_cupos.usados<30 returning usados into n;
  return n is not null;
end $$;
revoke all on function public.consumir_cupo_ia() from public,anon;
grant execute on function public.consumir_cupo_ia() to authenticated;

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
    insert into public.clientes(nombre,apellido,dni,email,whatsapp,ciudad,domicilio)
      values(person.nombre,person.apellido,person.dni,person.email,person.whatsapp,person.ciudad,nullif(btrim(person.domicilio),'')) returning id into booking.cliente_id;
  end if;
  insert into public.reservas(id,propiedad_id,cliente_id,canal_origen,checkin,checkout,adultos,menores,mascotas,precio_total,estado,notas_internas,requiere_sena,modalidad)
    values(booking.id,booking.propiedad_id,booking.cliente_id,booking.canal_origen,booking.checkin,booking.checkout,booking.adultos,booking.menores,booking.mascotas,booking.precio_total,booking.estado,booking.notas_internas,coalesce(booking.requiere_sena,true),coalesce(booking.modalidad,'temporal'));
  if p_pago is not null then perform public.registrar_cobro(booking.id,p_pago,false); end if;
  return booking.id;
end $$;

commit;
notify pgrst, 'reload schema';
