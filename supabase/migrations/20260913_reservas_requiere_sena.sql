-- Preserve current behavior until the owner explicitly exempts a reservation.
alter table public.reservas
  add column if not exists requiere_sena boolean not null default true;

comment on column public.reservas.requiere_sena is
  'Whether this reservation requires a deposit. Independent of payments and booking status.';

notify pgrst, 'reload schema';
