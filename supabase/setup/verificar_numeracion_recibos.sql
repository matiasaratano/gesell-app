-- Diagnostico de solo lectura para ejecutar en el SQL Editor de Supabase.
-- No crea recibos, no avanza secuencias y no modifica numeros existentes.

select column_name, data_type, column_default, is_identity, identity_generation,
       pg_get_serial_sequence('public.pagos', 'numero_recibo') as secuencia
from information_schema.columns
where table_schema = 'public' and table_name = 'pagos' and column_name = 'numero_recibo';

-- last_value puede ser nulo por permisos; una secuencia puede usar cache.
select schemaname, sequencename, increment_by, last_value, cache_size
from pg_sequences
where format('%I.%I', schemaname, sequencename)::regclass::text =
      pg_get_serial_sequence('public.pagos', 'numero_recibo');

-- Incluye triggers por si la asignacion no usa DEFAULT o IDENTITY.
select t.tgname, pg_get_triggerdef(t.oid) as trigger_def,
       pg_get_functiondef(t.tgfoid) as funcion
from pg_trigger t
where t.tgrelid = 'public.pagos'::regclass and not t.tgisinternal;

select indexname, indexdef
from pg_indexes where schemaname = 'public' and tablename = 'pagos';

select count(*) as pagos,
       count(*) filter (where to_jsonb(p)->>'numero_recibo' is null) as sin_numero,
       max((to_jsonb(p)->>'numero_recibo')::numeric) as numero_mayor
from public.pagos p;

select to_jsonb(p)->>'numero_recibo' as numero, count(*) as repeticiones
from public.pagos p
where to_jsonb(p)->>'numero_recibo' is not null
group by 1 having count(*) > 1;
