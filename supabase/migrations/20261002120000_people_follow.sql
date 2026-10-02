-- Following people (PLO-521, round 2 design): a shared feed of new and
-- upcoming work for the actors and directors Premium members follow, and
-- release-day notification rows that can show the person's headshot.
--
-- Builds on 20260928120000_premium_alerts.sql (person_alerts, the alert
-- notification columns, notifications_alert_shape_check) and on
-- 20261001090000_new_episode_notifications.sql, whose list_notifications() is
-- the latest definition and is extended below by adding lines only.
--
-- Additive only: one new table, one new nullable notifications column, the
-- alert shape check widened to one more release kind, and list_notifications()
-- returning its existing columns plus one.

-- ── 1. The people feed ───────────────────────────────────────────────────────

-- One row per person per title (and per season, for a show's new seasons),
-- written by the premium-alerts job and by people-feed-refresh with the service
-- role. Everything here comes from TMDB responses and is the same for every
-- viewer: which films, series and seasons a followed person has coming, and
-- when. The viewer's own region is applied when reading, from
-- regional_releases.
--
-- Rows exist only for people somebody follows. Readable by any signed-in
-- account so Home and the Your people page can query it directly; it names no
-- user. Clients cannot write it (no insert, update or delete policy).
create table if not exists public.people_feed (
  tmdb_person_id     integer not null check (tmdb_person_id > 0),
  media_type         text    not null check (media_type in ('movie', 'tv')),
  tmdb_id            integer not null check (tmdb_id > 0),
  -- 0 for a film or for a series as a whole; 1 and up for a show's seasons.
  season_number      integer not null default 0 check (season_number >= 0),
  -- film, series (a show's first season) or season (a later season).
  kind               text    not null check (kind in ('film', 'series', 'season')),
  person_name        text    not null,
  person_role        text    not null check (person_role in ('cast', 'director', 'creator')),
  character          text,
  title              text    not null,
  poster_path        text,
  -- TMDB's primary date: release_date for a film, the season's air date for TV.
  release_date       date,
  -- Films only: the first general release (theatrical or digital) per region,
  -- {"AU": {"kind": "theatrical", "date": "2026-12-16"}, ...}.
  regional_releases  jsonb   not null default '{}'::jsonb,
  -- TV only: the first network, and the season's episode count.
  network            text,
  episode_count      integer,
  -- TV only: episodes out on the premiere day. Equal to episode_count for a
  -- whole-season drop, 1 for weekly. Null until the premiere is close.
  premiere_drop      integer,
  updated_at         timestamptz not null default now(),
  primary key (tmdb_person_id, media_type, tmdb_id, season_number)
);
create index if not exists people_feed_release_idx on public.people_feed (release_date);

alter table public.people_feed enable row level security;

drop policy if exists "people feed readable" on public.people_feed;
create policy "people feed readable" on public.people_feed
  for select to authenticated using (true);

revoke all on public.people_feed from anon;
grant select on public.people_feed to authenticated;

-- ── 2. Notifications ─────────────────────────────────────────────────────────

-- The followed person's headshot, drawn over the poster on a release-day row.
alter table public.notifications
  add column if not exists person_profile_path text;

-- Latest definition: 20260928120000_premium_alerts.sql. The one change is the
-- release kinds: 'season' joins them, for a new season of a show a followed
-- person is in, and it must name its season. Every other clause is unchanged.
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
    or (type not in ('person_release', 'season_ready', 'new_episode') and actor_id is not null)
  );

-- ── 3. list_notifications() ──────────────────────────────────────────────────

-- redefines: list_notifications (adds person_profile_path, nothing else). The
-- body is the latest one, 20261001090000_new_episode_notifications.sql, with
-- one column added at the end of the select and the OUT list: the actor join,
-- the not_blocked clause and the referenced-post visibility checks are
-- unchanged. No ON CONFLICT anywhere in this file. The OUT columns change,
-- which create or replace cannot do, so it is dropped first; a new function is
-- executable by PUBLIC by default, hence the revoke before the grant.
drop function if exists public.list_notifications();
create or replace function public.list_notifications()
returns table (id uuid, type text, actor_id uuid, actor_username text,
               actor_display_name text, actor_avatar_url text, post_id uuid,
               post_title text, post_poster_path text,
               created_at timestamptz, read_at timestamptz,
               tmdb_id integer, media_type text, season_number integer,
               media_title text, media_poster_path text, air_date date,
               person_tmdb_id integer, person_name text, person_role text,
               release_kind text, provider_name text,
               episode_number integer, episode_count integer,
               person_profile_path text)
language sql stable security definer set search_path = public as $$
  select n.id, n.type, n.actor_id, p.username, p.display_name, p.avatar_url,
         n.post_id, fp.title, fp.poster_path, n.created_at, n.read_at,
         n.tmdb_id, n.media_type, n.season_number,
         n.media_title, n.media_poster_path, n.air_date,
         n.person_tmdb_id, n.person_name, n.person_role,
         n.release_kind, n.provider_name,
         n.episode_number, n.episode_count,
         n.person_profile_path
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
