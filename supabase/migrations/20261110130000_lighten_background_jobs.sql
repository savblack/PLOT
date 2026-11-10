-- Lighten production's background load while it runs on the Free plan's
-- smallest server (about 400 MB of memory against about 1.4 GB committed, so
-- it swaps, and swap spends the daily disk IO budget). Every change here makes
-- a background job do less when there is nothing to do; none changes what a
-- user sees when there is something to do.
--
-- 1. run_push_job: skip the edge function call when there is no work.
--    send-push and push-receipts each run 96 times a day, and every run boots
--    an edge function that reads several tables back through PostgREST.
--    On 2026-11-10 production had 0 push tokens and 0 deliveries, so all of it
--    was idle work. The checks mirror the edge functions' own first reads:
--    send-push needs an active token for a user with push switched on
--    (send-push/index.ts preferences + tokens); push-receipts needs a sent,
--    unreceipted delivery from the last 24 hours (push-receipts/index.ts).
--    When push ships, these return true and the jobs behave exactly as before.
--
-- 2. run_import_worker_tick: do the cheap "any work?" check before decrypting
--    the two Vault secrets, not after. Same result, less work per idle tick.
--
--    The schedule stays every 5 minutes on purpose: with the app closed, the
--    tick is what advances each slice of a large import (finish_import_slice
--    requeues with available_at = now()), so a slower tick slows imports.
--
-- Renumbered from 20261110120000: #1522 merged first with the same version
-- (20261110120000_db_load_trim), production recorded that version for it, and
-- the integration then refused this file as a duplicate, so none of it ran.
-- This file's third change, a daily cron.job_run_details cleanup, was dropped
-- because #1522's cron-history-purge (03:53 UTC) already does exactly that.
--
-- redefines: run_push_job (adds an early return; body otherwise identical to live 2026-11-10)
-- redefines: run_import_worker_tick (moves the existing work check above the Vault reads)

create or replace function public.run_push_job(p_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  bearer text;
  base_url text;
begin
  if p_name not in ('send-push', 'push-receipts') then
    raise exception 'invalid_push_job';
  end if;
  -- Nothing to send or check: skip the edge function round trip.
  if p_name = 'send-push' and not exists (
    select 1 from public.push_tokens t
      join public.notification_preferences p on p.user_id = t.user_id
     where t.disabled_at is null and p.push_enabled
  ) then
    return;
  end if;
  if p_name = 'push-receipts' and not exists (
    select 1 from public.push_deliveries
     where status = 'sent' and receipted_at is null and provider_ref is not null
       and sent_at >= now() - interval '24 hours'
  ) then
    return;
  end if;
  select decrypted_secret into bearer from vault.decrypted_secrets where name = 'edge_webhook_bearer';
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'edge_webhook_base_url';
  if bearer is null or base_url is null then
    raise warning 'run_push_job: vault secrets missing; skipping';
    return;
  end if;
  perform net.http_post(
    url := base_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || bearer),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
end;
$function$;

create or replace function public.run_import_worker_tick()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare bearer text; base_url text;
begin
  -- Nothing to do most minutes: skip the Vault reads and the HTTP round trip.
  if not exists (select 1 from public.import_jobs
    where (status in ('queued','retry_wait') and available_at <= now()) or (status = 'running' and lease_until < now())) then
    return;
  end if;
  select decrypted_secret into bearer from vault.decrypted_secrets where name = 'edge_webhook_bearer';
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'edge_webhook_base_url';
  if bearer is null or base_url is null then
    raise warning 'run_import_worker_tick: vault secrets missing; skipping this run';
    return;
  end if;
  perform net.http_post(
    url := base_url || '/functions/v1/import-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || bearer),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
end $function$;
