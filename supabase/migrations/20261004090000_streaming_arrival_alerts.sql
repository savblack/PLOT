-- Streaming alerts for films on your watchlist ("now streaming / now free").
--
-- Free, in-app, automatic. Everyone with a film on their watchlist ("My List",
-- list_items) is told when it:
--   * gains a subscription offer on one of their own services
--     (profiles.streaming_providers), or
--   * becomes free or free-with-ads on any service,
-- in their region (profiles.region). There is nothing to switch on: the
-- watchlist is the opt-in. They can mute one film, or turn the whole thing off
-- (notification_preferences). Push, email and phone notifications are a later,
-- Premium option and are not built; nothing here sends any of them.
--
-- A film coming out to rent or buy after cinemas is the separate movie_release
-- alert (20261003090000) and is not repeated.
--
-- Each day the streaming-arrival-alerts Edge Function looks at TMDB's
-- watch/providers for the films on watchlists, keeps its own snapshot, and only
-- believes a change once it has held across two daily snapshots (TMDB has no
-- history and its provider data lags and flaps). The rules are in
-- supabase/functions/_shared/availabilityAlerts.js and are unit-tested.
--
-- Tables written only by the function (service role, no client policies):
--   title_availability  per film + region: confirmed, pending and missing providers
--   availability_events the ledger: one row per film, region, provider and bucket,
--                       ever. A provider that flaps out and back conflicts here
--                       and tells nobody
--   alert_job_runs      one row per run, so failures and anomalies are visible
--
-- Tables written by the person, for themselves:
--   movie_streaming_alert_mutes  films they do not want these alerts for
--   notification_preferences     the global switch (more channels land here later)
--
-- It reuses notification columns that already exist (tmdb_id, media_type,
-- media_title, media_poster_path, air_date, release_kind, provider_name,
-- dedupe_key), so list_notifications() is unchanged and returns these rows as it
-- is. release_kind is 'streaming' or 'free'.
--
-- Additive only: new tables, a wider type check and a wider shape check that
-- every existing row already satisfies, and one scheduled job.

-- ── 1. Their choices ────────────────────────────────────────────────────────

-- Films someone has muted. Absence of a row means "alert me", so a new watchlist
-- entry needs no write at all. tmdb_id comes from the title panel's TMDB details;
-- title is a display cache for the list in Settings.
create table if not exists public.movie_streaming_alert_mutes (
  user_id    uuid    not null references auth.users (id) on delete cascade,
  tmdb_id    integer not null check (tmdb_id > 0),
  title      text    not null check (char_length(title) between 1 and 300),
  created_at timestamptz not null default now(),
  primary key (user_id, tmdb_id)
);

alter table public.movie_streaming_alert_mutes enable row level security;

-- Read, add and remove your own, under a cap that keeps one account from
-- growing the table without bound. No update policy: a mute is added or
-- removed, never edited. Free and Premium alike.
drop policy if exists "own streaming mutes readable" on public.movie_streaming_alert_mutes;
create policy "own streaming mutes readable" on public.movie_streaming_alert_mutes
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own streaming mutes deletable" on public.movie_streaming_alert_mutes;
create policy "own streaming mutes deletable" on public.movie_streaming_alert_mutes
  for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "own streaming mutes insertable" on public.movie_streaming_alert_mutes;
create policy "own streaming mutes insertable" on public.movie_streaming_alert_mutes
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and (select count(*) from public.movie_streaming_alert_mutes m where m.user_id = auth.uid()) < 2000
  );

revoke all on public.movie_streaming_alert_mutes from anon;
grant select, insert, delete on public.movie_streaming_alert_mutes to authenticated;

-- The global switch. A missing row means on, so nobody needs a row until they
-- turn something off. Its own table, not a profiles column, so it can grow a
-- column per channel (push, email) without touching profiles' triggers, views
-- and column grants.
create table if not exists public.notification_preferences (
  user_id          uuid    not null references auth.users (id) on delete cascade,
  streaming_alerts boolean not null default true,
  updated_at       timestamptz not null default now(),
  -- A table-level key, not an inline one: scripts/check-db-write-paths.mjs only
  -- recognises this shape when it folds a not-yet-applied migration into the
  -- schema it checks upserts against.
  primary key (user_id)
);

alter table public.notification_preferences enable row level security;

drop policy if exists "own notification preferences readable" on public.notification_preferences;
create policy "own notification preferences readable" on public.notification_preferences
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own notification preferences insertable" on public.notification_preferences;
create policy "own notification preferences insertable" on public.notification_preferences
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "own notification preferences updatable" on public.notification_preferences;
create policy "own notification preferences updatable" on public.notification_preferences
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.notification_preferences from anon;
grant select, insert, update on public.notification_preferences to authenticated;

-- ── 2. The job's own state ──────────────────────────────────────────────────

-- What the job believes is streaming per film and region. confirmed is
-- {"flatrate": {"<provider id>": "<name>"}, "free": {...}, "ads": {...}};
-- pending and missing are keyed "<bucket>:<provider id>" and hold the time a
-- provider was first seen, or first absent. baselined_at is when the first
-- snapshot was taken, which tells nobody anything.
create table if not exists public.title_availability (
  tmdb_id         integer not null check (tmdb_id > 0),
  region          text    not null check (region ~ '^[A-Z]{2}$'),
  confirmed       jsonb   not null default '{"flatrate": {}, "free": {}, "ads": {}}'::jsonb,
  pending         jsonb   not null default '{}'::jsonb,
  missing         jsonb   not null default '{}'::jsonb,
  baselined_at    timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (tmdb_id, region)
);
-- The job reads the stalest films first so none starves behind a busy run.
create index if not exists title_availability_checked_idx on public.title_availability (last_checked_at);

-- One row per provider that has ever been confirmed on a film in a region. The
-- unique key is what keeps a flapping provider from alerting twice.
create table if not exists public.availability_events (
  tmdb_id       integer not null check (tmdb_id > 0),
  region        text    not null check (region ~ '^[A-Z]{2}$'),
  provider_id   integer not null check (provider_id > 0),
  bucket        text    not null check (bucket in ('flatrate', 'free', 'ads')),
  provider_name text    not null,
  first_seen_at timestamptz not null,
  confirmed_at  timestamptz not null default now(),
  primary key (tmdb_id, region, provider_id, bucket)
);
create index if not exists availability_events_recent_idx on public.availability_events (confirmed_at desc);

-- Monitoring. The existing alert jobs only return JSON to pg_net, which is
-- short-lived; this keeps a run's counts and whether the breaker tripped.
create table if not exists public.alert_job_runs (
  id          bigint generated always as identity primary key,
  job         text    not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  stats       jsonb   not null default '{}'::jsonb
);
create index if not exists alert_job_runs_job_idx on public.alert_job_runs (job, started_at desc);

-- No policies on purpose: row level security on with nothing granted means only
-- the service role (which bypasses it) can read or write these.
alter table public.title_availability enable row level security;
alter table public.availability_events enable row level security;
alter table public.alert_job_runs enable row level security;
revoke all on public.title_availability, public.availability_events, public.alert_job_runs from anon, authenticated;

-- ── 3. Notification constraints ─────────────────────────────────────────────

-- Latest definition: 20261003090000_movie_release_notifications.sql. Every type
-- there is kept; the whole check is replaced, so dropping one would make every
-- write of that type fail.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow_request', 'follow_accepted', 'new_follower',
                  'post_like', 'post_comment', 'comment_like',
                  'watch_together_request', 'watch_together_accepted',
                  'watch_together_session', 'watch_together_list',
                  'new_episode', 'person_release', 'season_ready',
                  'smart_list_digest', 'movie_release', 'streaming_arrival'));

-- Latest definition: 20261003090000_movie_release_notifications.sql. One change:
-- a streaming_arrival branch (no actor, a dedupe key, a film, the service it
-- arrived on, and whether it is a subscription or free), and the catch-all
-- social branch excludes it. Every other clause is unchanged.
alter table public.notifications drop constraint if exists notifications_alert_shape_check;
alter table public.notifications add constraint notifications_alert_shape_check
  check (
    (type = 'person_release'
      and actor_id is null and dedupe_key is not null
      and tmdb_id is not null and media_type in ('movie', 'tv')
      and person_tmdb_id is not null and person_name is not null
      and person_role in ('cast', 'director', 'creator')
      and release_kind in ('theatrical', 'digital', 'premiere', 'season')
      and (release_kind <> 'season' or season_number is not null))
    or (type = 'season_ready'
      and actor_id is null and dedupe_key is not null
      and tmdb_id is not null and media_type = 'tv'
      and season_number is not null and provider_name is not null)
    or type = 'new_episode'
    or (type = 'smart_list_digest'
      and actor_id is null and dedupe_key is not null
      and jsonb_typeof(smart_list_digest) = 'object')
    or (type = 'movie_release'
      and actor_id is null and dedupe_key is not null
      and tmdb_id is not null and media_type = 'movie'
      and release_kind in ('theatrical', 'digital'))
    or (type = 'streaming_arrival'
      and actor_id is null and dedupe_key is not null
      and tmdb_id is not null and media_type = 'movie'
      and release_kind in ('streaming', 'free')
      and provider_name is not null)
    or (type not in ('person_release', 'season_ready', 'new_episode', 'smart_list_digest', 'movie_release', 'streaming_arrival')
      and actor_id is not null)
  );

-- ── 4. Daily schedule ───────────────────────────────────────────────────────

-- Same shape as run_movie_release_notifications() (20261003090000): the bearer
-- and base URL come from Vault, so no credential lands in the schema. Those
-- secrets already exist on Production and Staging.
create or replace function public.run_streaming_arrival_alerts() returns void
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
    raise warning 'run_streaming_arrival_alerts: vault secrets missing; skipping this run';
    return;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/streaming-arrival-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := '{}'::jsonb,
    -- One TMDB call per distinct opted-in film. The function stops fetching
    -- after about 100s and carries the rest to the next run, so this bounds the
    -- request, not the cron tick.
    timeout_milliseconds := 150000
  );
end;
$fn$;

revoke execute on function public.run_streaming_arrival_alerts() from public, anon, authenticated;

comment on function public.run_streaming_arrival_alerts() is
  'Calls the streaming-arrival-alerts Edge Function. Bearer and base URL come from Vault so no credential lands in the schema.';

-- 22:15 UTC, after premium-alerts (21:00, 21:30) and movie-release-notifications
-- (21:45), so the Edge Function slots do not overlap. The two-snapshot rule
-- needs at least 20 hours between looks, which a daily run satisfies.
create extension if not exists pg_cron;

do $do$
begin
  -- scripts/db-migration-test.sh has no cron schema (see
  -- 20260913230451_schedule_pg_stat_statements_reset.sql). Skip out loud there.
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped scheduling streaming-arrival-alerts';
    return;
  end if;

  perform cron.unschedule('streaming-arrival-alerts')
    where exists (select 1 from cron.job where jobname = 'streaming-arrival-alerts');

  perform cron.schedule(
    'streaming-arrival-alerts',
    '15 22 * * *',
    $cron$select public.run_streaming_arrival_alerts()$cron$
  );
end
$do$;
