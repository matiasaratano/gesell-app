-- Conserva los clientes existentes. Solo impide nuevas identidades duplicadas.
begin;
create or replace function public.cliente_nombre_clave(nombre text, apellido text)
returns text language sql immutable parallel safe set search_path = public as $$
  select lower(trim(regexp_replace(coalesce(nombre, '') || ' ' || coalesce(apellido, ''), '[[:space:]]+', ' ', 'g')))
$$;

create or replace function public.cliente_dni_clave(dni text)
returns text language sql immutable parallel safe set search_path = public as $$
  select upper(regexp_replace(coalesce(dni, ''), '[.[:space:]-]+', '', 'g'))
$$;

create or replace function public.evitar_cliente_duplicado()
returns trigger language plpgsql set search_path = public as $$
declare
  nombre_nuevo text := public.cliente_nombre_clave(new.nombre, new.apellido);
  dni_nuevo text := public.cliente_dni_clave(new.dni);
begin
  -- Permite corregir contacto y notas de duplicados antiguos sin crear otros.
  if tg_op = 'UPDATE' then
    if nombre_nuevo = public.cliente_nombre_clave(old.nombre, old.apellido)
      and dni_nuevo = public.cliente_dni_clave(old.dni) then
      return new;
    end if;
  end if;

  -- Serializa altas para que dos formularios simultaneos no creen el mismo cliente.
  perform pg_advisory_xact_lock(61011, 1);
  if exists(select 1 from public.clientes c where c.id is distinct from new.id
    and ((nombre_nuevo <> '' and public.cliente_nombre_clave(c.nombre, c.apellido) = nombre_nuevo)
      or (dni_nuevo <> '' and public.cliente_dni_clave(c.dni) = dni_nuevo))) then
    raise exception using errcode = '23505',
      message = 'Ya existe un cliente con ese nombre completo o DNI. Buscalo y selecciona el cliente existente; no se creo otro registro.';
  end if;
  return new;
end;
$$;

drop trigger if exists clientes_evitar_duplicados on public.clientes;
create trigger clientes_evitar_duplicados
before insert or update of nombre, apellido, dni on public.clientes
for each row execute function public.evitar_cliente_duplicado();
commit;
