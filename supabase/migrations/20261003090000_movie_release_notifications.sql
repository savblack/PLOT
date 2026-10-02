-- Movie release notifications: a notification type with no actor, for a film on
-- one of your lists coming out in your region. Free, in-app.
--
-- The episode equivalent is new_episode (20261001090000); the Premium alert for
-- a film by someone you follow is person_release (20260928120000). This one is
-- about a film you saved yourself.
--
-- Writer: the movie-release-notifications Edge Function, daily, with the service
-- role (scheduled at the bottom of this file). There is still no insert policy,
-- so clients cannot forge a row.
--
-- It reuses columns that already exist (tmdb_id, media_type, media_title,
-- media_poster_path, air_date, release_kind, dedupe_key), so list_notifications()
-- is unchanged and returns movie_release rows as it is.
--
-- Deduplication shares premium-alerts' key on purpose: a movie_release row's
-- dedupe_key is person_release:movie:<tmdb_id>. The unique (user_id, dedupe_key)
-- index from 20260928120000 then allows one alert per person per film whichever
-- job runs first, so a film that is both on your list and by someone you follow
-- is announced once.
--
-- Additive only: a wider type check and a wider shape check that every existing
-- row already satisfies, and one scheduled job.

-- ── 1. Constraints ──────────────────────────────────────────────────────────

-- Latest definition: 20261002180000_smart_list_digest.sql. Every type there is
-- kept; the whole check is replaced, so dropping one would make every write of
-- that type fail.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow_request', 'follow_accepted', 'new_follower',
                  'post_like', 'post_comment', 'comment_like',
                  'watch_together_request', 'watch_together_accepted',
                  'watch_together_session', 'watch_together_list',
                  'new_episode', 'person_release', 'season_ready',
                  'smart_list_digest', 'movie_release'));

-- Latest definition: 20261002180000_smart_list_digest.sql. One change: a
-- movie_release branch (no actor, a dedupe key, a film, and whether it came out
-- in cinemas or to watch at home), and the catch-all social branch excludes it.
-- Every other clause is unchanged.
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
    or (type not in ('person_release', 'season_ready', 'new_episode', 'smart_list_digest', 'movie_release')
      and actor_id is not null)
  );

-- ── 2. Daily schedule ───────────────────────────────────────────────────────

-- Same shape as run_new_episode_notifications() (20261001090000): the bearer and
-- base URL come from Vault, so no credential lands in the schema. Those secrets
-- already exist on Production and Staging.
create or replace function public.run_movie_release_notifications() returns void
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
    raise warning 'run_movie_release_notifications: vault secrets missing; skipping this run';
    return;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/movie-release-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := '{}'::jsonb,
    -- One TMDB call per distinct saved film that could be out. pg_net is
    -- async; this bounds the request, not the cron tick.
    timeout_milliseconds := 120000
  );
end;
$fn$;

revoke execute on function public.run_movie_release_notifications() from public, anon, authenticated;

comment on function public.run_movie_release_notifications() is
  'Calls the movie-release-notifications Edge Function. Bearer and base URL come from Vault so no credential lands in the schema.';

-- 21:45 UTC, after premium-alerts' people run (21:00) and season run (21:30), so
-- when a film is both on your list and by someone you follow, the richer
-- "with <person>" row is written first and this job's duplicate is dropped by
-- the shared dedupe key. That is 7:45am AEST, so Australian release-day films
-- arrive the morning after the UTC date they came out; the window looks back
-- three days, so a late run heals itself.
create extension if not exists pg_cron;

do $do$
begin
  -- scripts/db-migration-test.sh has no cron schema (see
  -- 20260913230451_schedule_pg_stat_statements_reset.sql). Skip out loud there.
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped scheduling movie-release-notifications';
    return;
  end if;

  perform cron.unschedule('movie-release-notifications')
    where exists (select 1 from cron.job where jobname = 'movie-release-notifications');

  perform cron.schedule(
    'movie-release-notifications',
    '45 21 * * *',
    $cron$select public.run_movie_release_notifications()$cron$
  );
end
$do$;
