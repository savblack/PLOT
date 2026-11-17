-- Saved comparisons: the people a viewer has run a taste comparison with, so
-- the Compare page can list them on every device.
--
-- Only WHO and WHEN are stored. The comparison itself is never kept: it holds
-- the other person's history, and opening a saved person calls taste_overlap()
-- again, which still enforces Premium, visibility and blocks.
--
-- Expand only: one new table and three new functions. Nothing existing is
-- changed, dropped or recreated, so builds already installed are unaffected.
--
-- The table is not reachable through the API. It has RLS on, no policies and
-- no grants; the three functions below are the only way in, and each acts
-- only for auth.uid().

create table if not exists public.saved_comparisons (
  viewer_id   uuid not null references auth.users(id) on delete cascade,
  target_id   uuid not null references auth.users(id) on delete cascade,
  compared_at timestamptz not null default now(),
  primary key (viewer_id, target_id),
  constraint saved_comparisons_no_self check (viewer_id <> target_id)
);

-- Deleting an account cascades from target_id as well as viewer_id.
create index if not exists saved_comparisons_target_idx
  on public.saved_comparisons (target_id);

comment on table public.saved_comparisons is
  'Who a viewer has compared taste with, and when. No comparison results. Read and written only through list_saved_comparisons(), save_comparison() and remove_saved_comparison().';

alter table public.saved_comparisons enable row level security;
revoke all on table public.saved_comparisons from public, anon, authenticated;

-- The viewer's own list, newest first. Identity comes from profiles, which no
-- client can read directly, so this carries the same not_blocked clause as
-- every other identity read: a block in either direction hides the row.
create or replace function public.list_saved_comparisons()
returns table (id uuid, username text, display_name text, avatar_url text,
               is_public boolean, compared_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_public, s.compared_at
  from public.saved_comparisons s
  join public.profiles p on p.id = s.target_id
  where s.viewer_id = auth.uid()
    and private.not_blocked(p.id)
  order by s.compared_at desc
  limit 12
$$;

-- Called by the app when a comparison has loaded. Saving again moves the
-- person to the top. Only a profile the caller can already read is saved
-- (can_view_profile: public or an accepted follow, never across a block), the
-- same test taste_overlap() applies, so this cannot be used to turn an
-- arbitrary id into a name. Anything else is skipped without an error,
-- because the caller is a background save, not a button. Only the newest 12
-- are kept, the same number the list shows.
create or replace function public.save_comparison(p_target uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_target is null or p_target = v_me or not public.can_view_profile(p_target) then return; end if;

  begin
    insert into public.saved_comparisons (viewer_id, target_id)
    values (v_me, p_target)
    on conflict (viewer_id, target_id) do update set compared_at = now();
  exception when foreign_key_violation then
    return;
  end;

  delete from public.saved_comparisons s
   where s.viewer_id = v_me
     and s.target_id not in (
       select k.target_id from public.saved_comparisons k
        where k.viewer_id = v_me
        order by k.compared_at desc
        limit 12);
end;
$$;

-- The x on a row. By id, so it needs no profile lookup.
create or replace function public.remove_saved_comparison(p_target uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  delete from public.saved_comparisons where viewer_id = v_me and target_id = p_target;
end;
$$;

revoke execute on function public.list_saved_comparisons()        from public, anon;
revoke execute on function public.save_comparison(uuid)           from public, anon;
revoke execute on function public.remove_saved_comparison(uuid)   from public, anon;
grant  execute on function public.list_saved_comparisons()        to authenticated;
grant  execute on function public.save_comparison(uuid)           to authenticated;
grant  execute on function public.remove_saved_comparison(uuid)   to authenticated;
