-- Solo lectura. Deberia devolver cero filas antes de compartir formularios.
-- No incluye las dos RPC publicas deliberadas ni funciones puras/trigger.
select 'tabla o vista accesible sin login' as revisar, c.oid::regclass::text as objeto
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v','m')
  and (has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('anon',c.oid,'INSERT')
    or has_table_privilege('anon',c.oid,'UPDATE') or has_table_privilege('anon',c.oid,'DELETE'))
union all
select 'funcion SECURITY DEFINER a revisar', p.oid::regprocedure::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
  and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))
  and p.proname not in ('es_administrador','crear_enlace_solicitud','ver_formulario_solicitud','enviar_formulario_solicitud','obtener_formulario_general','ver_formulario_general','recibir_solicitud_publica')
union all
select 'vista accesible a cuentas no habilitadas', c.oid::regclass::text
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m') and has_table_privilege('authenticated',c.oid,'SELECT');
