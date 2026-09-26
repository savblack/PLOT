-- New-episode notifications: a notification type with no actor.
--
-- Every notification so far is social: "<actor> did something", so actor_id was
-- NOT NULL and list_notifications() inner-joined profiles on it. new_episode is
-- about a title instead. The row names the show and the episode (or the first
-- episode of a same-day drop, with episode_count covering the rest), and carries
-- the title and poster as they were when the row was written so the feed renders
-- without a TMDB call per row.
--
-- Writer: the new-episode-notifications Edge Function, daily, with the service
-- role (scheduled at the bottom of this file). There is still no insert policy,
-- so clients cannot forge a row.
--
-- Additive only: two nullable-safe column changes, new columns, a wider type
-- check, a shape check every existing row already satisfies (all have an
-- actor), one unique index, and a list_notifications() that returns the old
-- columns unchanged plus new ones.

-- ── 1. Columns ──────────────────────────────────────────────────────────────

alter table public.notifications alter column actor_id drop not null;

alter table public.notifications
  add column if not exists tmdb_id           integer,
  add column if not exists media_type        text,
  add column if not exists season_number     integer,
  add column if not exists episode_number    integer,
  add column if not exists episode_count     integer not null default 1,
  add column if not exists media_title       text,
  add column if not exists media_poster_path text,
  add column if not exists air_date          date;

-- Keeps every existing type (the post_* types have no writer since
-- 20260814000000, but the check never dropped them and this is not the place).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow_request', 'follow_accepted', 'new_follower',
                  'post_like', 'post_comment', 'comment_like',
                  'new_episode'));

-- Social rows keep their actor; title rows must say which episode they mean.
alter table public.notifications drop constraint if exists notifications_subject_check;
alter table public.notifications add constraint notifications_subject_check
  check (
    (type = 'new_episode'
      and actor_id is null
      and media_type = 'tv'
      and tmdb_id is not null
      and season_number is not null
      and episode_number is not null
      and episode_count >= 1)
    or (type <> 'new_episode' and actor_id is not null)
  );

-- One row per person per episode, however many times the job runs. Not partial,
-- so PostgREST's upsert (onConflict + ignoreDuplicates) can name it; social rows
-- have NULL in these columns and NULLs never collide.
create unique index if not exists notifications_new_episode_once
  on public.notifications (user_id, type, tmdb_id, season_number, episode_number);

-- ── 2. list_notifications() ─────────────────────────────────────────────────

-- redefines: list_notifications (inner join on profiles becomes a left join so
-- actorless rows survive; adds the title columns). The body is the
-- 20260918030000 body plus those changes: the not_blocked clause and the
-- referenced-post visibility checks are carried over unchanged. Run
-- `pnpm run db:function-diff` before merging to confirm against production.
--
-- The OUT columns change, which create or replace cannot do, so it is dropped
-- and recreated. A new function is executable by PUBLIC by default, hence the
-- explicit revoke before the grant.
drop function if exists public.list_notifications();
create function public.list_notifications()
returns table (id uuid, type text, actor_id uuid, actor_username text,
               actor_display_name text, actor_avatar_url text, post_id uuid,
               post_title text, post_poster_path text,
               created_at timestamptz, read_at timestamptz,
               tmdb_id integer, media_type text, season_number integer,
               episode_number integer, episode_count integer,
               media_title text, media_poster_path text, air_date date)
language sql stable security definer set search_path = public as $$
  select n.id, n.type, n.actor_id, p.username, p.display_name, p.avatar_url,
         n.post_id, fp.title, fp.poster_path, n.created_at, n.read_at,
         n.tmdb_id, n.media_type, n.season_number, n.episode_number,
         n.episode_count, n.media_title, n.media_poster_path, n.air_date
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

-- ── 3. Daily schedule ───────────────────────────────────────────────────────

-- Same shape as run_marketing_linear_mirror() (20260912090000): the bearer and
-- base URL come from Vault, so no credential lands in the schema. Those secrets
-- already exist on Production and Staging; the guard there covers them.
create or replace function public.run_new_episode_notifications() returns void
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
    raise warning 'run_new_episode_notifications: vault secrets missing; skipping this run';
    return;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/new-episode-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := '{}'::jsonb,
    -- One TMDB call per followed show plus a season call per drop. pg_net is
    -- async; this bounds the request, not the cron tick.
    timeout_milliseconds := 120000
  );
end;
$fn$;

revoke execute on function public.run_new_episode_notifications() from public, anon, authenticated;

comment on function public.run_new_episode_notifications() is
  'Calls the new-episode-notifications Edge Function. Bearer and base URL come from Vault so no credential lands in the schema.';

-- 12:00 UTC (8am US Eastern, 10pm AEST). The function looks at episodes dated
-- yesterday and the day before, never today (a US evening episode dated today
-- has not aired yet), so one missed run heals on the next without duplicates
-- (notifications_new_episode_once).
-- Already installed by 20260912090000; repeated so this stands on its own
-- against a restored database.
create extension if not exists pg_cron;

do $do$
begin
  -- scripts/db-migration-test.sh has no cron schema (see
  -- 20260913230451_schedule_pg_stat_statements_reset.sql). Skip out loud there.
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped scheduling new-episode-notifications';
    return;
  end if;

  perform cron.unschedule('new-episode-notifications')
    where exists (select 1 from cron.job where jobname = 'new-episode-notifications');

  perform cron.schedule(
    'new-episode-notifications',
    '0 12 * * *',
    $cron$select public.run_new_episode_notifications()$cron$
  );
end
$do$;
