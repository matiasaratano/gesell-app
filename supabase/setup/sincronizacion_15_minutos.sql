-- Optional setup, separate from schema migrations. Configure Vault first.
-- No credentials are written into the job definition or repository.
begin;
do $$
declare
  app_url text;
  token text;
begin
  select decrypted_secret into app_url from vault.decrypted_secrets where name = 'gesell_app_url';
  select decrypted_secret into token from vault.decrypted_secrets where name = 'gesell_cron_secret';
  if app_url is null or app_url !~ '^https://[^/]+$' or coalesce(length(token), 0) < 32 then
    raise exception 'Configurar gesell_app_url (HTTPS sin barra final) y gesell_cron_secret (32+ caracteres) en Vault antes de activar.';
  end if;
end;
$$;

select cron.schedule('gesell-sync-ical-15m', '*/15 * * * *', $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'gesell_app_url') || '/api/cron/sync-ical',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'gesell_cron_secret')),
    timeout_milliseconds := 60000
  );
$job$);
commit;
