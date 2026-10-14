-- Custom posters, backdrops, logos, and person photos.
--
-- One row per account, subject, and image kind. season_number is -1 when the
-- choice is not a season. Season 0 is Specials. file_path is a TMDB image
-- path, never a full URL.
--
-- Premium can add and replace a choice. Delete stays open after Premium
-- lapses so the row can be removed. The apps hide saved artwork until the
-- account is Premium again. Other people cannot read these rows.

create table if not exists public.user_artwork (
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_type text not null,
  tmdb_id integer not null,
  season_number integer not null,
  kind text not null,
  file_path text not null,
  updated_at timestamptz not null default now(),
  constraint user_artwork_tmdb_id check (tmdb_id > 0),
  constraint user_artwork_file_path check (
    char_length(file_path) between 2 and 300
    and file_path ~ '^/[^[:space:]]+$'
    and position('..' in file_path) = 0
    and position('://' in file_path) = 0
  ),
  constraint user_artwork_subject_kind check (
    (subject_type in ('movie', 'tv') and season_number = -1 and kind in ('poster', 'backdrop', 'logo'))
    or (subject_type = 'season' and season_number >= 0 and kind = 'poster')
    or (subject_type = 'person' and season_number = -1 and kind = 'profile')
  ),
  -- A table-level key, not an inline one. scripts/check-db-write-paths.mjs
  -- only recognises this shape when it folds a pending migration into the
  -- schema it checks.
  primary key (user_id, subject_type, tmdb_id, season_number, kind)
);

alter table public.user_artwork enable row level security;

drop policy if exists "own artwork readable" on public.user_artwork;
create policy "own artwork readable" on public.user_artwork
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "own artwork insertable" on public.user_artwork;
create policy "own artwork insertable" on public.user_artwork
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.is_premium()
    and (select count(*) from public.user_artwork existing where existing.user_id = (select auth.uid())) < 2000
  );

drop policy if exists "own artwork updatable" on public.user_artwork;
create policy "own artwork updatable" on public.user_artwork
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and public.is_premium()
  );

drop policy if exists "own artwork deletable" on public.user_artwork;
create policy "own artwork deletable" on public.user_artwork
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_artwork from public, anon;
grant select, insert, update, delete on table public.user_artwork to authenticated;
grant all on table public.user_artwork to service_role;

drop trigger if exists user_artwork_set_updated_at on public.user_artwork;
create trigger user_artwork_set_updated_at
  before update on public.user_artwork
  for each row execute function public.set_updated_at();
