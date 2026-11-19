-- Episode alerts at the drop (phase 3a of docs/features/episode-drop-times.md).
--
-- 1. Two switches on notification_preferences, both on by default:
--      episode_alerts  "Episode alerts in Plot": the in-app new_episode row.
--                      Off means neither job writes one for this person.
--      episode_push    "Episode alerts on my phone": send-push skips
--                      new_episode rows when off. Push itself still needs
--                      push_enabled.
--    A missing row means both on, as for streaming_alerts. The table already
--    grants select, insert and update to authenticated (20261004090000), and
--    its row policies are per user, so no grant changes.
--
-- 2. The episode-drop-alerts Edge Function, every 15 minutes at :05, :20, :35
--    and :50. It writes new_episode rows for episodes whose exact drop time
--    (episode_airings, 20261119100000) has just passed. send-push runs on the
--    quarter hour, so a push follows within about ten minutes. The daily
--    new-episode-notifications job is unchanged and still covers date-only
--    shows; the shared unique index (notifications_new_episode_once) stops
--    anyone being told twice.
--
-- Additive only: two columns with defaults, one function, one scheduled job.

alter table public.notification_preferences
  add column if not exists episode_alerts boolean not null default true;
alter table public.notification_preferences
  add column if not exists episode_push boolean not null default true;

-- Same shape as run_episode_air_times() (20261119100000): bearer and base URL
-- from Vault, so no credential lands in the schema.
create or replace function public.run_episode_drop_alerts() returns void
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

  if bearer is null or base_url is null then
    raise warning 'run_episode_drop_alerts: vault secrets missing; skipping this run';
    return;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/episode-drop-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$fn$;

revoke execute on function public.run_episode_drop_alerts() from public, anon, authenticated;

comment on function public.run_episode_drop_alerts() is
  'Calls the episode-drop-alerts Edge Function. Bearer and base URL come from Vault so no credential lands in the schema.';

create extension if not exists pg_cron;

do $do$
begin
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped scheduling episode-drop-alerts';
    return;
  end if;

  perform cron.unschedule('episode-drop-alerts')
    where exists (select 1 from cron.job where jobname = 'episode-drop-alerts');

  -- Clear of send-push (:00, :15, :30, :45), push-receipts (:07, :22, :37, :52)
  -- and episode-air-times (:40).
  perform cron.schedule(
    'episode-drop-alerts',
    '5,20,35,50 * * * *',
    $cron$select public.run_episode_drop_alerts()$cron$
  );
end
$do$;
