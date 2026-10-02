-- Smart lists redesign (PLO-513): "new since you last looked" (A4) and the
-- weekly roll-up notification (C4).
--
-- Additive except for two constraint redefinitions and list_notifications():
--   1. smart_list_seen: per smart list, the match keys its owner has been
--      shown, the keys the weekly job found since (pending), and when the list
--      was last opened. Owner-only under RLS; the job writes with the service role.
--   2. notifications.smart_list_digest (jsonb): the roll-up's payload
--      ({count, lists: [{id, name, count}], posters: [poster_path]}).
--   3. notifications_type_check and notifications_alert_shape_check gain
--      'smart_list_digest', each from its latest definition.
--   4. list_notifications() returns the new column at the end. Nothing else.
--   5. run_smart_list_digest() and a weekly pg_cron schedule, the Vault bearer
--      pattern from 20260928120000_premium_alerts.sql.
--
-- Idempotent per person per ISO week: the job writes one row with
-- dedupe_key 'smart_list_digest:<week>' through notifications_dedupe_once
-- (user_id, dedupe_key), upserted with ignoreDuplicates.
--
-- No existing row changes. Existing notifications all satisfy the widened
-- checks: smart_list_digest is a new type and every other branch is unchanged.

-- ── 1. smart_list_seen ───────────────────────────────────────────────────────

create table if not exists public.smart_list_seen (
  list_id        uuid primary key references public.user_custom_lists (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  seen_keys      text[] not null default '{}',
  pending_keys   text[] not null default '{}',
  last_opened_at timestamptz,
  last_checked_at timestamptz,
  updated_at     timestamptz not null default now(),
  -- Caps match packages/core/smartListSeen.js and _shared/smartListDigest.js.
  constraint smart_list_seen_seen_cap check (cardinality(seen_keys) <= 1000),
  constraint smart_list_seen_pending_cap check (cardinality(pending_keys) <= 200)
);

comment on table public.smart_list_seen is
  'Per smart list: match keys ("movie:123") shown at the last open, keys the weekly roll-up found since, and when the list was last opened. packages/core/smartListSeen.js.';

create index if not exists smart_list_seen_user_idx on public.smart_list_seen (user_id);

alter table public.smart_list_seen enable row level security;

-- The owner reads and writes their own rows, and only for their own smart lists.
create policy "Owners read their smart list seen rows"
  on public.smart_list_seen for select
  using (auth.uid() = user_id);

create policy "Owners add seen rows to their smart lists"
  on public.smart_list_seen for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_custom_lists l
      where l.id = list_id and l.user_id = auth.uid() and l.rules is not null
    )
  );

create policy "Owners update their smart list seen rows"
  on public.smart_list_seen for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_custom_lists l
      where l.id = list_id and l.user_id = auth.uid() and l.rules is not null
    )
  );

create policy "Owners delete their smart list seen rows"
  on public.smart_list_seen for delete
  using (auth.uid() = user_id);

revoke all on public.smart_list_seen from anon;
grant select, insert, update, delete on public.smart_list_seen to authenticated;

create or replace function public.touch_smart_list_seen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_smart_list_seen() from public, anon, authenticated;
create trigger touch_smart_list_seen
before update on public.smart_list_seen
for each row execute function public.touch_smart_list_seen();

-- ── 2. The roll-up's payload ─────────────────────────────────────────────────

alter table public.notifications
  add column if not exists smart_list_digest jsonb;

comment on column public.notifications.smart_list_digest is
  'Weekly smart lists roll-up: {count, lists: [{id, name, count}], posters: [poster_path]}. Only on type smart_list_digest.';

-- ── 3. Checks ────────────────────────────────────────────────────────────────

-- Latest definition: 20261001090000_new_episode_notifications.sql. One type added.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow_request', 'follow_accepted', 'new_follower',
                  'post_like', 'post_comment', 'comment_like',
                  'watch_together_request', 'watch_together_accepted',
                  'watch_together_session', 'watch_together_list',
                  'new_episode', 'person_release', 'season_ready',
                  'smart_list_digest'));

-- Latest definition: 20261002120000_people_follow.sql. Two changes: a
-- smart_list_digest branch (no actor, a dedupe key, a payload), and the
-- catch-all social branch excludes it, since a roll-up has no actor. Every
-- other clause is unchanged.
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
    or (type not in ('person_release', 'season_ready', 'new_episode', 'smart_list_digest') and actor_id is not null)
  );

-- ── 4. list_notifications() ──────────────────────────────────────────────────

-- redefines: list_notifications (adds smart_list_digest, nothing else). The
-- body is the latest one, 20261002120000_people_follow.sql, with one column
-- added at the end of the select and the OUT list: the actor join, the
-- not_blocked clause and the referenced-post visibility checks are unchanged.
-- No ON CONFLICT anywhere in this file. The OUT columns change, which create
-- or replace cannot do, so it is dropped first; a new function is executable
-- by PUBLIC by default, hence the revoke before the grant.
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
               person_profile_path text,
               smart_list_digest jsonb)
language sql stable security definer set search_path = public as $$
  select n.id, n.type, n.actor_id, p.username, p.display_name, p.avatar_url,
         n.post_id, fp.title, fp.poster_path, n.created_at, n.read_at,
         n.tmdb_id, n.media_type, n.season_number,
         n.media_title, n.media_poster_path, n.air_date,
         n.person_tmdb_id, n.person_name, n.person_role,
         n.release_kind, n.provider_name,
         n.episode_number, n.episode_count,
         n.person_profile_path,
         n.smart_list_digest
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

-- ── 5. Weekly schedule ───────────────────────────────────────────────────────

-- Same shape as run_premium_alerts() (20260928120000): the bearer and base
-- URL come from Vault, so no credential lands in the schema.
create or replace function public.run_smart_list_digest() returns void
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

  -- Warn rather than raise, matching run_premium_alerts().
  if bearer is null or base_url is null then
    raise warning 'run_smart_list_digest: vault secrets missing; skipping this run';
    return;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/smart-list-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := '{}'::jsonb,
    -- One or two TMDB calls per smart list. pg_net is async; this bounds the
    -- request, not the cron tick.
    timeout_milliseconds := 150000
  );
end;
$fn$;

revoke all on function public.run_smart_list_digest() from public, anon, authenticated;

comment on function public.run_smart_list_digest() is
  'Calls the smart-list-digest Edge Function (weekly smart lists roll-up). Bearer and base URL come from Vault so no credential lands in the schema.';

do $do$
begin
  -- scripts/db-migration-test.sh has no cron schema. Skip out loud there.
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped scheduling smart-list-digest';
    return;
  end if;

  perform cron.unschedule(jobname) from cron.job where jobname = 'smart-list-digest';

  -- Sundays 21:00 UTC: Monday 7am in Sydney (AEST), Sunday afternoon in the
  -- US. The dedupe key is the ISO week, so a retried or doubled run in the
  -- same week writes nothing more.
  perform cron.schedule('smart-list-digest', '0 21 * * 0',
    $cron$select public.run_smart_list_digest()$cron$);
end
$do$;
