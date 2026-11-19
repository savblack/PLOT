-- Exact episode drop times, phase 1: collect them. Nothing user-facing reads
-- these yet; display (calendar, Episode alerts card, Tonight) and alerts at the
-- drop are later changes.
--
-- Source: TVmaze, which records the broadcast time and time zone per episode.
-- TMDB (Plot's main source) only has dates. Each followed TMDB show is linked to
-- its TVmaze show by TheTVDB or IMDb id, never by title, so two shows with one
-- name cannot be mixed up. A show with no match stays date-only.
--
-- The episode-air-times Edge Function runs hourly. It links new followed shows,
-- asks TVmaze which shows changed in the last day, and re-reads only those (plus
-- any not read for three days). Rules: supabase/functions/_shared/episodeAirings.js,
-- unit-tested in apps/web/tests/unit/episodeAirings.test.js.
--
-- A blank TVmaze airtime is stored as a date with no instant (time_source
-- 'date'), never as a time: TVmaze returns a placeholder airstamp for those.
--
-- Additive only: two new tables, one function, one scheduled job.

-- ── 1. Show links (job-only) ────────────────────────────────────────────────

create table if not exists public.tvmaze_show_links (
  tmdb_id         integer not null check (tmdb_id > 0),
  -- null: looked up, no match. Looked up again after 14 days.
  tvmaze_id       integer check (tvmaze_id > 0),
  match_source    text    not null check (match_source in ('thetvdb', 'imdb', 'none')),
  -- Where it airs: a broadcast network (country and time zone) or a streaming
  -- service (country null when worldwide). Phase 2 uses this to tell a US
  -- airing from an imported one.
  venue_kind      text    check (venue_kind in ('network', 'web')),
  venue_name      text,
  venue_country   text    check (venue_country ~ '^[A-Z]{2}$'),
  venue_timezone  text,
  -- TVmaze's own "updated" for the show (unix seconds) at our last read, so an
  -- unchanged show is not re-read.
  tvmaze_updated  bigint,
  checked_at      timestamptz not null default now(),
  synced_at       timestamptz,
  primary key (tmdb_id)
);
create index if not exists tvmaze_show_links_tvmaze_idx on public.tvmaze_show_links (tvmaze_id);

alter table public.tvmaze_show_links enable row level security;
revoke all on public.tvmaze_show_links from anon, authenticated;
-- A deny-all policy so the "RLS on, no policy" advisor stays quiet (the
-- convention from 20261012170000); the service role bypasses it.
drop policy if exists "tvmaze_show_links is server-only" on public.tvmaze_show_links;
create policy "tvmaze_show_links is server-only" on public.tvmaze_show_links
  for select using (false);

-- ── 2. Episode times (public schedule data) ─────────────────────────────────

create table if not exists public.episode_airings (
  tmdb_id           integer not null check (tmdb_id > 0),
  season_number     integer not null check (season_number >= 0),
  episode_number    integer not null check (episode_number >= 0),
  tvmaze_episode_id integer not null check (tvmaze_episode_id > 0),
  -- The broadcaster's local date, as TVmaze lists it.
  air_date          date    not null,
  -- The broadcaster's local clock time ("21:00"), and the instant it means.
  -- Both null unless time_source is 'exact'.
  air_time          text    check (air_time ~ '^\d{2}:\d{2}$'),
  airs_at           timestamptz,
  time_source       text    not null check (time_source in ('exact', 'date')),
  runtime_minutes   integer check (runtime_minutes > 0),
  -- The last move of this drop. The alert brake (phase 3) counts these.
  previous_air_date date,
  previous_airs_at  timestamptz,
  changed_at        timestamptz,
  first_seen_at     timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (tmdb_id, season_number, episode_number),
  check ((time_source = 'exact') = (airs_at is not null and air_time is not null))
);
create index if not exists episode_airings_airs_at_idx on public.episode_airings (airs_at) where airs_at is not null;
create index if not exists episode_airings_changed_idx on public.episode_airings (changed_at) where changed_at is not null;

-- TV schedules are public facts, so anyone may read them, signed in or not.
-- Only the job (service role) writes.
alter table public.episode_airings enable row level security;
drop policy if exists "episode airings readable" on public.episode_airings;
create policy "episode airings readable" on public.episode_airings
  for select to anon, authenticated using (true);
revoke all on public.episode_airings from anon, authenticated;
grant select on public.episode_airings to anon, authenticated;

-- ── 3. Hourly schedule ──────────────────────────────────────────────────────

-- Same shape as run_streaming_arrival_alerts() (20261004090000): the bearer and
-- base URL come from Vault, so no credential lands in the schema.
create or replace function public.run_episode_air_times() returns void
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
    raise warning 'run_episode_air_times: vault secrets missing; skipping this run';
    return;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/episode-air-times',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := '{}'::jsonb,
    -- The function stops calling TVmaze after about 100s and carries the rest
    -- to the next hour.
    timeout_milliseconds := 150000
  );
end;
$fn$;

revoke execute on function public.run_episode_air_times() from public, anon, authenticated;

comment on function public.run_episode_air_times() is
  'Calls the episode-air-times Edge Function. Bearer and base URL come from Vault so no credential lands in the schema.';

create extension if not exists pg_cron;

do $do$
begin
  -- scripts/db-migration-test.sh has no cron schema. Skip out loud there.
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped scheduling episode-air-times';
    return;
  end if;

  perform cron.unschedule('episode-air-times')
    where exists (select 1 from cron.job where jobname = 'episode-air-times');

  -- :40 each hour, clear of send-push (every 15 minutes from :00) and
  -- push-receipts (:07, :22, :37, :52).
  perform cron.schedule(
    'episode-air-times',
    '40 * * * *',
    $cron$select public.run_episode_air_times()$cron$
  );
end
$do$;
