-- OPERATOR STEP: execute only with explicit deployment approval, after all
-- migrations, worker deployment, Vault checks and authorised provider pilots.
-- This file is not a migration and is not executed by CI or application startup.
begin;
create function public.run_tracking_tick() returns void language plpgsql security definer set search_path=public as $$
declare bearer text; base_url text;
begin
  select decrypted_secret into bearer from vault.decrypted_secrets where name='edge_webhook_bearer';
  select decrypted_secret into base_url from vault.decrypted_secrets where name='edge_webhook_base_url';
  if bearer is null or base_url is null then raise exception 'Tracking worker Vault configuration missing'; end if;
  perform net.http_post(url:=base_url || '/functions/v1/tracking-worker',
    headers:=jsonb_build_object('Content-Type','application/json','apikey',bearer,'Authorization','Bearer ' || bearer),
    body:='{}'::jsonb,timeout_milliseconds:=90000);
end $$;
revoke all on function public.run_tracking_tick() from public,anon,authenticated;
grant execute on function public.run_tracking_tick() to service_role;
select cron.schedule('plot-tracking','* * * * *',$cron$select public.run_tracking_tick()$cron$);
commit;
