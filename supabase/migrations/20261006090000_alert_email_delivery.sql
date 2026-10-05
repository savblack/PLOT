-- Premium email alerts: the same streaming alert that lands in the app
-- (notifications.type = 'streaming_arrival', #1183), also sent by email.
--
-- Opt-in, default off, Premium only. In-app alerts stay Free and automatic; this
-- is only the choice to also get them outside the app. Push is a later channel
-- and slots into the same delivery ledger.
--
-- The in-app notification row stays the source of truth. The alert-email-delivery
-- Edge Function (daily, 22:45 UTC, after the 22:15 detection job) looks at recent
-- streaming_arrival rows for people who have turned email on, and sends one
-- email per person per run covering everything new. notification_deliveries is
-- the idempotency ledger: a row is claimed (primary key) before anything is
-- sent, so a re-run, a retry or a crash never sends the same alert twice and a
-- failed send is retried a few times.
--
-- Consent: opt-in only (default false), withdrawn by one click from the email
-- (alert-email-unsubscribe) or in Settings, and kept separate from the weekly
-- digest's consent (profiles.marketing_emails / marketing_subscribers), so
-- unsubscribing from one never silently changes the other.
--
-- Additive only: one column, one trigger, two tables of the service role's,
-- one RPC and one scheduled job. Nothing existing is redefined.

-- ── 1. The switch ───────────────────────────────────────────────────────────

-- A missing row, and a false value, both mean "no email". Everyone defaults off.
alter table public.notification_preferences
  add column if not exists streaming_email boolean not null default false;

-- Premium is required to turn email ON, not to have it recorded off, and not to
-- edit the other columns of a row. So this is a trigger on the transition rather
-- than a policy check: a policy `with check` would also block a lapsed member
-- from changing their in-app switch while an old `true` sits in the row. Delivery
-- re-checks Premium on every run, so a lapsed member simply stops receiving.
-- 42501 is what an RLS denial raises, so the client's existing mapping
-- (alertWriteError -> 'premium_required') opens the upgrade sheet.
create or replace function public.enforce_streaming_email_premium() returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.streaming_email is true
     and (tg_op = 'INSERT' or old.streaming_email is distinct from true)
     and not public.is_premium(new.user_id) then
    raise exception 'premium_required' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

drop trigger if exists notification_preferences_email_premium on public.notification_preferences;
create trigger notification_preferences_email_premium
  before insert or update on public.notification_preferences
  for each row execute function public.enforce_streaming_email_premium();

-- ── 2. The delivery ledger ──────────────────────────────────────────────────

-- One row per notification per channel, written only by the service role.
--   pending  claimed by a run that is about to send (claimed_at is the lease: a
--            pending row older than the lease was abandoned and may be retaken)
--   sent     handed to the provider (provider_ref is its id)
--   failed   the provider refused or the call failed; retried up to a limit
--   skipped  deliberately not sent (kept for the audit trail)
create table if not exists public.notification_deliveries (
  notification_id uuid    not null references public.notifications (id) on delete cascade,
  channel         text    not null check (channel in ('email', 'push')),
  status          text    not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts        integer not null default 1,
  provider_ref    text,
  error           text,
  claimed_at      timestamptz not null default now(),
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  -- A table-level key, not an inline one: scripts/check-db-write-paths.mjs only
  -- recognises this shape when it folds a not-yet-applied migration into the
  -- schema it checks upserts against.
  primary key (notification_id, channel)
);
-- The job looks for rows still worth acting on.
create index if not exists notification_deliveries_open_idx
  on public.notification_deliveries (channel, status, claimed_at)
  where status in ('pending', 'failed');

-- No policies on purpose: row level security on with nothing granted means only
-- the service role (which bypasses it) can read or write it.
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon, authenticated;

-- ── 3. Where to send ────────────────────────────────────────────────────────

-- The current, confirmed address for each person, read from auth.users at send
-- time rather than copied (a copy goes stale when someone changes their email).
-- Service role only: it returns addresses.
create or replace function public.alert_email_recipients(p_users uuid[])
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text
    from auth.users u
   where u.id = any (p_users)
     and u.email is not null
     and u.email_confirmed_at is not null;
$$;

revoke all on function public.alert_email_recipients(uuid[]) from public, anon, authenticated;
grant execute on function public.alert_email_recipients(uuid[]) to service_role;

-- ── 4. Daily schedule ───────────────────────────────────────────────────────

-- Same shape as run_streaming_arrival_alerts() (20261004090000): the bearer and
-- base URL come from Vault, so no credential lands in the schema.
create or replace function public.run_alert_email_delivery() returns void
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
    raise warning 'run_alert_email_delivery: vault secrets missing; skipping this run';
    return;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/alert-email-delivery',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := '{}'::jsonb,
    -- The function stops sending after about 100s and leaves the rest for the
    -- next run, so this bounds the request, not the cron tick.
    timeout_milliseconds := 150000
  );
end;
$fn$;

revoke execute on function public.run_alert_email_delivery() from public, anon, authenticated;

comment on function public.run_alert_email_delivery() is
  'Calls the alert-email-delivery Edge Function. Bearer and base URL come from Vault so no credential lands in the schema.';

-- 22:45 UTC, after streaming-arrival-alerts (22:15), so the day's new
-- notifications are already written when the emails are built.
create extension if not exists pg_cron;

do $do$
begin
  -- scripts/db-migration-test.sh has no cron schema (see
  -- 20260913230451_schedule_pg_stat_statements_reset.sql). Skip out loud there.
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped scheduling alert-email-delivery';
    return;
  end if;

  perform cron.unschedule('alert-email-delivery')
    where exists (select 1 from cron.job where jobname = 'alert-email-delivery');

  perform cron.schedule(
    'alert-email-delivery',
    '45 22 * * *',
    $cron$select public.run_alert_email_delivery()$cron$
  );
end
$do$;
