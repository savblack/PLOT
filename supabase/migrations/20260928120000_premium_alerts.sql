-- Premium alerts (PLO-521): actor/director release alerts and whole-season-ready
-- alerts, delivered as in-app notifications.
--
-- Two opt-in tables, written by the person themselves (RLS, Premium checked in
-- the insert policy), and two notification types with no actor, written by the
-- premium-alerts Edge Function on a daily pg_cron schedule with the service
-- role. Clients still cannot insert notifications: there is no insert policy.
--
-- A lapsed subscription keeps its opt-ins (the person keeps their choices if
-- they come back) but stops receiving alerts: the job asks is_premium() for
-- every recipient on every run, via premium_user_ids() below.
--
-- Additive only: new tables, nullable notification columns, a wider type
-- check, a new shape check that every existing row already satisfies (they all
-- have an actor), one unique index, and list_notifications() returning the old
-- columns unchanged plus new ones.
--
-- Overlap with PR #1032 (new_episode notifications): the shared title columns
-- here (tmdb_id, media_type, season_number, media_title, media_poster_path,
-- air_date) use that PR's names and types, and the type check already admits
-- 'new_episode'. #1032's migration (20261001090000) builds on this one: it adds
-- episode_number and episode_count and extends list_notifications() from the
-- body below. So this PR merges first. If list_notifications() or
-- notifications_type_check changes here, #1032 needs the same change.
--
-- This must be newer than main's newest migration when it merges. If
-- 20260928160000 (#1091) lands first, renumber this to sort after it but
-- before 20261001090000.

-- ── 1. Opt-ins ───────────────────────────────────────────────────────────────

-- People someone follows for release alerts. tmdb_person_id always comes from a
-- TMDB response (the person page the toggle sits on); name, photo and
-- department are a display cache for Settings, never used for matching.
create table if not exists public.person_alerts (
  user_id        uuid    not null references auth.users (id) on delete cascade,
  tmdb_person_id integer not null check (tmdb_person_id > 0),
  name           text    not null check (char_length(name) between 1 and 200),
  profile_path   text    check (profile_path is null or char_length(profile_path) <= 200),
  known_for      text    check (known_for is null or char_length(known_for) <= 60),
  created_at     timestamptz not null default now(),
  primary key (user_id, tmdb_person_id)
);
create index if not exists person_alerts_person_idx on public.person_alerts (tmdb_person_id);

-- Shows someone wants a whole-season-ready alert for. tmdb_id comes from the
-- title panel's TMDB details; title and poster are a display cache.
create table if not exists public.season_ready_alerts (
  user_id     uuid    not null references auth.users (id) on delete cascade,
  tmdb_id     integer not null check (tmdb_id > 0),
  title       text    not null check (char_length(title) between 1 and 300),
  poster_path text    check (poster_path is null or char_length(poster_path) <= 200),
  created_at  timestamptz not null default now(),
  primary key (user_id, tmdb_id)
);
create index if not exists season_ready_alerts_show_idx on public.season_ready_alerts (tmdb_id);

alter table public.person_alerts enable row level security;
alter table public.season_ready_alerts enable row level security;

-- Read and remove your own. Adding one needs Premium and stays under a cap that
-- bounds what one account can make the daily job fetch from TMDB. There is no
-- update policy: an opt-in is added or removed, never edited.
drop policy if exists "own person alerts readable" on public.person_alerts;
create policy "own person alerts readable" on public.person_alerts
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own person alerts deletable" on public.person_alerts;
create policy "own person alerts deletable" on public.person_alerts
  for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "premium person alerts insertable" on public.person_alerts;
create policy "premium person alerts insertable" on public.person_alerts
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.is_premium()
    and (select count(*) from public.person_alerts a where a.user_id = auth.uid()) < 500
  );

drop policy if exists "own season alerts readable" on public.season_ready_alerts;
create policy "own season alerts readable" on public.season_ready_alerts
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own season alerts deletable" on public.season_ready_alerts;
create policy "own season alerts deletable" on public.season_ready_alerts
  for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "premium season alerts insertable" on public.season_ready_alerts;
create policy "premium season alerts insertable" on public.season_ready_alerts
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.is_premium()
    and (select count(*) from public.season_ready_alerts a where a.user_id = auth.uid()) < 500
  );

revoke all on public.person_alerts, public.season_ready_alerts from anon;
grant select, insert, delete on public.person_alerts, public.season_ready_alerts to authenticated;

-- ── 2. Notification columns ──────────────────────────────────────────────────

alter table public.notifications alter column actor_id drop not null;

alter table public.notifications
  -- Shared with #1032's new_episode rows (same names and types).
  add column if not exists tmdb_id           integer,
  add column if not exists media_type        text,
  add column if not exists season_number     integer,
  add column if not exists media_title       text,
  add column if not exists media_poster_path text,
  add column if not exists air_date          date,
  -- person_release: who the alert is about, and how it came out.
  add column if not exists person_tmdb_id    integer,
  add column if not exists person_name       text,
  add column if not exists person_role       text,
  add column if not exists release_kind      text,
  -- season_ready: the selected service the season was found on.
  add column if not exists provider_name     text,
  -- One row per person per alert, however many times the job runs.
  add column if not exists dedupe_key        text;

-- Latest definition was 20260927120000_watch_together_shared_lists.sql; every
-- type there is kept. new_episode is admitted ahead of #1032 so the two PRs
-- do not fight over this constraint.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow_request', 'follow_accepted', 'new_follower',
                  'post_like', 'post_comment', 'comment_like',
                  'watch_together_request', 'watch_together_accepted',
                  'watch_together_session', 'watch_together_list',
                  'new_episode', 'person_release', 'season_ready'));

-- Alert rows name their title and carry a dedupe key; social rows keep their
-- actor. new_episode is left to #1032's own check.
alter table public.notifications drop constraint if exists notifications_alert_shape_check;
alter table public.notifications add constraint notifications_alert_shape_check
  check (
    (type = 'person_release'
      and actor_id is null and dedupe_key is not null
      and tmdb_id is not null and media_type in ('movie', 'tv')
      and person_tmdb_id is not null and person_name is not null
      and person_role in ('cast', 'director', 'creator')
      and release_kind in ('theatrical', 'digital', 'premiere'))
    or (type = 'season_ready'
      and actor_id is null and dedupe_key is not null
      and tmdb_id is not null and media_type = 'tv'
      and season_number is not null and provider_name is not null)
    or type = 'new_episode'
    or (type not in ('person_release', 'season_ready', 'new_episode') and actor_id is not null)
  );

-- Not partial, so PostgREST's upsert (onConflict + ignoreDuplicates) can name
-- it. Social rows have a NULL key and NULLs never collide.
create unique index if not exists notifications_dedupe_once
  on public.notifications (user_id, dedupe_key);

-- ── 3. list_notifications() ──────────────────────────────────────────────────

-- redefines: list_notifications (the inner join on profiles becomes a left
-- join so actorless alert rows survive; adds the alert columns). The body is
-- the latest one, 20260918030000_security_scan_remediation.sql, plus those
-- changes: the not_blocked clause on the actor and the referenced-post
-- visibility checks are carried over unchanged, and an actor row whose
-- profile is gone is still dropped. No ON CONFLICT anywhere in this file's
-- functions. Run `pnpm run db:function-diff` before merging.
--
-- The OUT columns change, which create or replace cannot do, so it is dropped
-- first. A new function is executable by PUBLIC by default, hence the revoke
-- before the grant.
drop function if exists public.list_notifications();
create or replace function public.list_notifications()
returns table (id uuid, type text, actor_id uuid, actor_username text,
               actor_display_name text, actor_avatar_url text, post_id uuid,
               post_title text, post_poster_path text,
               created_at timestamptz, read_at timestamptz,
               tmdb_id integer, media_type text, season_number integer,
               media_title text, media_poster_path text, air_date date,
               person_tmdb_id integer, person_name text, person_role text,
               release_kind text, provider_name text)
language sql stable security definer set search_path = public as $$
  select n.id, n.type, n.actor_id, p.username, p.display_name, p.avatar_url,
         n.post_id, fp.title, fp.poster_path, n.created_at, n.read_at,
         n.tmdb_id, n.media_type, n.season_number,
         n.media_title, n.media_poster_path, n.air_date,
         n.person_tmdb_id, n.person_name, n.person_role,
         n.release_kind, n.provider_name
  from public.notifications n
  left join public.profiles p on p.id = n.actor_id
  left join public.feed_posts fp
    on fp.id = n.post_id
   and public.not_blocked(fp.author_id)
   and (
     auth.uid() = fp.author_id
     or public.is_profile_public(fp.author_id)
     or public.is_accepted_follower(fp.author_id)
   )
  where n.user_id = auth.uid()
    and (n.actor_id is null or (p.id is not null and public.not_blocked(n.actor_id)))
  order by n.created_at desc
  limit 50
$$;

revoke execute on function public.list_notifications() from public, anon;
grant execute on function public.list_notifications() to authenticated;

-- ── 4. Premium recipients ────────────────────────────────────────────────────

-- The job's entitlement check: which of these people are Premium right now.
-- Delegates to is_premium() so there is one definition of Premium. Service
-- role only: it would otherwise tell anyone who else pays.
create or replace function public.premium_user_ids(p_users uuid[])
returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct u from unnest(p_users) as u where public.is_premium(u)
$$;

revoke all on function public.premium_user_ids(uuid[]) from public, anon, authenticated;
grant execute on function public.premium_user_ids(uuid[]) to service_role;

-- ── 5. Daily schedule ────────────────────────────────────────────────────────

-- Same shape as run_marketing_linear_mirror() (20260912090000): the bearer and
-- base URL come from Vault, so no credential lands in the schema.
create or replace function public.run_premium_alerts(p_only text) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  bearer   text;
  base_url text;
begin
  if p_only not in ('people', 'seasons') then
    raise warning 'run_premium_alerts: unknown kind %; skipping', p_only;
    return;
  end if;

  select decrypted_secret into bearer
    from vault.decrypted_secrets where name = 'edge_webhook_bearer';
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'edge_webhook_base_url';

  -- Warn rather than raise, matching run_marketing_linear_mirror().
  if bearer is null or base_url is null then
    raise warning 'run_premium_alerts: vault secrets missing; skipping this run';
    return;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/premium-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := jsonb_build_object('only', p_only),
    -- One TMDB call per followed person or show plus a few per hit. pg_net is
    -- async; this bounds the request, not the cron tick.
    timeout_milliseconds := 150000
  );
end;
$fn$;

revoke all on function public.run_premium_alerts(text) from public, anon, authenticated;

comment on function public.run_premium_alerts(text) is
  'Calls the premium-alerts Edge Function for people or seasons. Bearer and base URL come from Vault so no credential lands in the schema.';

-- pg_cron is already installed (20260912090000). Not repeated here: the block
-- below skips scheduling when the cron schema is absent, which keeps this file
-- applicable in a plain Postgres sandbox (db:migration-test, db:function-diff).

do $do$
begin
  -- scripts/db-migration-test.sh has no cron schema (see
  -- 20260913230451_schedule_pg_stat_statements_reset.sql). Skip out loud there.
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped scheduling premium-alerts';
    return;
  end if;

  perform cron.unschedule(jobname) from cron.job
    where jobname in ('premium-alerts-people', 'premium-alerts-seasons');

  -- 21:00 and 21:30 UTC: 7am and 7:30am in Sydney (AEST), early evening in the
  -- US. The job looks back three days and every row is deduplicated, so one
  -- missed run heals on the next without anyone seeing an alert twice.
  perform cron.schedule('premium-alerts-people', '0 21 * * *',
    $cron$select public.run_premium_alerts('people')$cron$);
  perform cron.schedule('premium-alerts-seasons', '30 21 * * *',
    $cron$select public.run_premium_alerts('seasons')$cron$);
end
$do$;
