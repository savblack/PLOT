-- Private notes are independent of lists/history: removing or watching a title
-- must not delete its note. No feed trigger or public read policy is attached.
create table public.private_title_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_id bigint not null check (tmdb_id > 0),
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null default '',
  note text not null check (char_length(note) <= 1000),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, tmdb_id, media_type)
);
alter table public.private_title_notes enable row level security;
revoke all on public.private_title_notes from public, anon;
grant select, insert, update, delete on public.private_title_notes to authenticated;
create policy own_private_notes on public.private_title_notes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Invoker rights preserve RLS. Revision check prevents silent overwrites from
-- another device. Empty notes retain only a revision tombstone to prevent ABA.
create function public.save_private_title_note(
  p_user_id uuid, p_tmdb_id bigint, p_media_type text, p_note text,
  p_expected_revision integer, p_title text default ''
) returns public.private_title_notes
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  current_revision integer;
  saved public.private_title_notes;
begin
  if owner_id is null or p_user_id is distinct from owner_id then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':' || p_media_type || ':' || p_tmdb_id::text, 0));
  select revision into current_revision from public.private_title_notes
    where user_id = owner_id and tmdb_id = p_tmdb_id and media_type = p_media_type;
  if p_expected_revision is null or coalesce(current_revision, 0) <> p_expected_revision then
    raise exception 'Note changed elsewhere' using errcode = '40001';
  end if;
  insert into public.private_title_notes (user_id, tmdb_id, media_type, title, note, revision)
    values (owner_id, p_tmdb_id, p_media_type, p_title, btrim(p_note), 1)
    on conflict (user_id, tmdb_id, media_type) do update
      set note = excluded.note, title = excluded.title,
          revision = private_title_notes.revision + 1, updated_at = now()
    returning * into saved;
  return saved;
end;
$$;
revoke all on function public.save_private_title_note(uuid, bigint, text, text, integer, text) from public, anon;
grant execute on function public.save_private_title_note(uuid, bigint, text, text, integer, text) to authenticated;
