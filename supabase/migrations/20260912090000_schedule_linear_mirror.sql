-- Schedule the Linear mirror sweep (marketing-linear-mirror).
--
-- WHY A CRON AND NOT A TRIGGER: the obvious move was to hang
-- notify_edge_function() off marketing_posts the way feedback and profiles do.
-- But db-write-paths.yml exists in this repo because an AFTER trigger aborted
-- the statement that fired it and silently broke every `history` write for two
-- weeks, and generate.mjs sets marketing_posts.status inside its render loop.
-- Mirroring an issue to Linear is not worth putting anywhere near a write path.
-- A sweep also heals on its own: a Linear outage costs one tick, not a week.
--
-- WHY NOT GITHUB ACTIONS: this used to run inside the weekly batch, which meant
-- LINEAR_API_KEY had to exist as a GitHub Actions secret as well as an Edge
-- Function secret. There is now one copy of that credential, here.
--
-- Reuses the Vault secrets the database webhooks already depend on
-- (20260814120000), so no credential lands in the schema and rotating the key
-- stays a Vault update rather than a migration.
--
-- The sweep is idempotent and cheap when there is nothing to do: three indexed
-- reads and, on a quiet tick, no Linear calls at all.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Same guard as the webhook migration: fail at deploy time rather than
-- scheduling a job that would 401 every five minutes into a log nobody reads.
do $guard$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'edge_webhook_bearer') then
    raise exception 'Vault secret edge_webhook_bearer is missing — see 20260814120000_webhook_bearer_to_vault.sql';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'edge_webhook_base_url') then
    raise exception 'Vault secret edge_webhook_base_url is missing — see 20260814120000_webhook_bearer_to_vault.sql';
  end if;
end
$guard$;

create or replace function public.run_marketing_linear_mirror() returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  bearer   text;
  base_url text;
begin
  select decrypted_secret into bearer
    from vault.decrypted_secrets where name = 'edge_webhook_bearer';
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'edge_webhook_base_url';

  -- Warn rather than raise, matching notify_edge_function(). A cron job that
  -- throws just fills cron.job_run_details with failures; the deploy-time guard
  -- above is what actually catches misconfiguration.
  if bearer is null or base_url is null then
    raise warning 'run_marketing_linear_mirror: vault secrets missing; skipping this tick';
    return;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/marketing-linear-mirror',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := '{}'::jsonb,
    -- Generous: a first sweep after the Sunday batch creates a dozen issues,
    -- each a round trip to Linear. pg_net is async — this bounds the request,
    -- not the cron tick.
    timeout_milliseconds := 30000
  );
end;
$fn$;

comment on function public.run_marketing_linear_mirror() is
  'Calls the marketing-linear-mirror Edge Function. Bearer and base URL come from Vault so no credential lands in the schema.';

-- Every 5 minutes. The weekly batch runs Sunday 00:30 UTC, so the week appears
-- in Linear within five minutes of being rendered; the same tick picks up copy
-- edits and published posts the rest of the week.
select cron.unschedule('marketing-linear-mirror')
  where exists (select 1 from cron.job where jobname = 'marketing-linear-mirror');

select cron.schedule(
  'marketing-linear-mirror',
  '*/5 * * * *',
  $cron$select public.run_marketing_linear_mirror()$cron$
);
