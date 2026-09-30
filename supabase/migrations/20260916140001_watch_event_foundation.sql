-- Additive storage only. No backfill: title summaries do not prove individual
-- watch events. No scheduler or public integration is enabled by this migration.
create table public.watch_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (length(source) between 1 and 64),
  source_account text not null check (length(source_account) between 1 and 256),
  source_key text not null check (length(source_key) between 1 and 2048),
  tmdb_id integer not null check (tmdb_id > 0),
  media_type text not null check (media_type in ('movie', 'tv')),
  season_number integer,
  episode_number integer,
  watched_on date,
  watched_at timestamptz,
  date_precision text not null check (date_precision in ('unknown', 'day', 'instant')),
  external_ids jsonb not null default '{}'::jsonb check (jsonb_typeof(external_ids) = 'object'),
  source_rating numeric check (source_rating between 0 and 10),
  source_review text,
  created_at timestamptz not null default now(),
  unique (user_id, source_key),
  check ((season_number is null and episode_number is null) or
    (media_type = 'tv' and season_number is not null and season_number >= 0
      and episode_number is not null and episode_number >= 1)),
  check ((date_precision = 'unknown' and watched_on is null and watched_at is null) or
    (date_precision = 'day' and watched_on is not null and watched_at is null) or
    (date_precision = 'instant' and watched_on is not null and watched_at is not null))
);

create index watch_events_user_title on public.watch_events(user_id, tmdb_id, media_type);
alter table public.watch_events enable row level security;
revoke all on public.watch_events from anon, authenticated;
grant select, insert, delete on public.watch_events to authenticated;
grant all on public.watch_events to service_role;
create policy watch_events_read on public.watch_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy watch_events_insert on public.watch_events for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy watch_events_delete on public.watch_events for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.watch_events is
  'Private additive source events. Existing history remains the editable title summary. Disconnect must retain events.';
