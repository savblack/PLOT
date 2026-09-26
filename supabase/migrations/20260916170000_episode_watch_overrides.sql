-- Preserve source watches while allowing private, persistent PLOT corrections.
create table public.episode_watch_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_id integer not null check (tmdb_id > 0),
  season_number integer not null check (season_number >= 0),
  episode_number integer not null check (episode_number > 0),
  watched boolean not null,
  updated_at timestamptz not null default now(),
  unique(user_id, tmdb_id, season_number, episode_number)
);
alter table public.episode_watch_overrides enable row level security;
create policy episode_overrides_owner on public.episode_watch_overrides
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.episode_watch_overrides from anon;
grant select, insert, update, delete on public.episode_watch_overrides to authenticated;
grant all on public.episode_watch_overrides to service_role;
