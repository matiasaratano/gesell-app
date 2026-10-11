-- La coincidencia pasa a ser una advertencia confirmable en el alta administrativa.
-- No se elimina ni combina ningun cliente existente.
begin;
drop trigger if exists clientes_evitar_duplicados on public.clientes;
commit;
