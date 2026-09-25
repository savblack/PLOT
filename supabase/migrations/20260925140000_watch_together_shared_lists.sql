-- Watch together, phase 3: shared lists and "Saved by Sam too". Builds on
-- 20260925120000_watch_together.sql. Design: docs/design/watch-together/README.md.
--
-- A shared list is an ordinary custom list with members. It counts only
-- against its creator's list allowance (the existing cap counts lists by
-- owner). Members can see it, rename it, add people, add and remove titles,
-- and leave. Only the creator can delete it. Only people you already watch
-- together with can be added, with no second accept.
--
-- Items keep user_id = the list owner, so the owner foreign key added in
-- 20260918030000 (list_id, user_id) stays exactly as it is. A new added_by
-- column records who added a title. Members write only through the security
-- definer functions below; the new policies are read-only.
--
-- Additive: one table, one column, read policies, new functions, one
-- trigger and one more notification type. No existing policy or function is
-- changed.

-- ── 1. Members ───────────────────────────────────────────────────────────────
create table if not exists public.user_custom_list_members (
  list_id    uuid not null references public.user_custom_lists(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  added_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index if not exists user_custom_list_members_user_idx on public.user_custom_list_members (user_id);
alter table public.user_custom_list_members enable row level security;

alter table public.user_custom_list_items
  add column if not exists added_by uuid references auth.users(id) on delete set null;

-- The caller is a member (not the owner) of the list, and neither has blocked
-- the other.
create or replace function public.is_custom_list_member(p_list uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_custom_list_members m
      join public.user_custom_lists l on l.id = m.list_id
     where m.list_id = p_list and m.user_id = auth.uid()
       and public.not_blocked(l.user_id)
  )
$$;

-- The caller owns the list or is a member of it.
create or replace function public.can_edit_shared_list(p_list uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_custom_lists where id = p_list and user_id = auth.uid())
      or public.is_custom_list_member(p_list)
$$;

drop policy if exists "Members read shared lists" on public.user_custom_lists;
create policy "Members read shared lists" on public.user_custom_lists
  for select to authenticated using (public.is_custom_list_member(id));

drop policy if exists "Members read shared list items" on public.user_custom_list_items;
create policy "Members read shared list items" on public.user_custom_list_items
  for select to authenticated using (public.is_custom_list_member(list_id));

drop policy if exists "Owners and members read list members" on public.user_custom_list_members;
create policy "Owners and members read list members" on public.user_custom_list_members
  for select to authenticated using (public.can_edit_shared_list(list_id));

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow_request', 'follow_accepted', 'new_follower',
                  'post_like', 'post_comment', 'comment_like',
                  'watch_together_request', 'watch_together_accepted',
                  'watch_together_session', 'watch_together_list'));

-- ── 2. Creating and joining ──────────────────────────────────────────────────

-- Make a shared list. Every member must be the caller's watch together
-- partner. With p_seed_partner, it starts with the titles the caller and that
-- partner have both saved. Returns the new list id. The existing cap trigger
-- and plan check apply as for any list.
create or replace function public.create_shared_list(
  p_name text, p_members uuid[], p_seed_partner uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_member uuid;
begin
  if auth.uid() is null or coalesce(array_length(p_members, 1), 0) = 0 then raise exception 'not_allowed'; end if;
  if not public.is_premium() then raise exception 'premium_required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'not_allowed'; end if;
  foreach v_member in array p_members loop
    if not public.is_watch_together_partner(v_member) then raise exception 'not_allowed'; end if;
  end loop;
  if p_seed_partner is not null and not (p_seed_partner = any (p_members)) then raise exception 'not_allowed'; end if;

  insert into public.user_custom_lists (user_id, name) values (auth.uid(), trim(p_name)) returning id into v_id;

  insert into public.user_custom_list_members (list_id, user_id, added_by)
    select v_id, m, auth.uid() from unnest(p_members) m
    on conflict do nothing;

  if p_seed_partner is not null then
    insert into public.user_custom_list_items (list_id, user_id, tmdb_id, media_type, title, poster_path, genre_ids, added_by)
      select v_id, auth.uid(), t.tmdb_id, t.media_type, coalesce(t.title, ''), t.poster_path, coalesce(t.genre_ids, '{}'), auth.uid()
        from public.watch_together_titles(array[p_seed_partner]) t
       where t.media_type in ('movie', 'tv')
      on conflict (list_id, tmdb_id) do nothing;
  end if;

  insert into public.notifications (user_id, type, actor_id)
    select m, 'watch_together_list', auth.uid() from unnest(p_members) m;
  return v_id;
end;
$$;

-- Add someone to a list you own or are on. They must be your watch together
-- partner. Returns false when they were already on it.
create or replace function public.add_shared_list_member(p_list uuid, p_user uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if not public.can_edit_shared_list(p_list) or not public.is_watch_together_partner(p_user)
     or not public.not_blocked(p_user) then
    raise exception 'not_allowed';
  end if;
  select user_id into v_owner from public.user_custom_lists where id = p_list;
  if p_user = v_owner or not exists (select 1 from public.profiles where id = p_user) then
    return false;
  end if;
  insert into public.user_custom_list_members (list_id, user_id, added_by)
    values (p_list, p_user, auth.uid())
    on conflict do nothing;
  if not found then return false; end if;
  insert into public.notifications (user_id, type, actor_id) values (p_user, 'watch_together_list', auth.uid());
  return true;
end;
$$;

-- Leave a list you are a member of. The owner deletes instead.
create or replace function public.leave_shared_list(p_list uuid)
returns void
language sql security definer set search_path = public as $$
  delete from public.user_custom_list_members where list_id = p_list and user_id = auth.uid()
$$;

-- ── 3. Editing ───────────────────────────────────────────────────────────────

create or replace function public.rename_shared_list(p_list uuid, p_name text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_shared_list(p_list) or nullif(trim(p_name), '') is null then
    raise exception 'not_allowed';
  end if;
  update public.user_custom_lists set name = trim(p_name) where id = p_list;
end;
$$;

-- Add a title. The row keeps the owner's user_id (the owner foreign key
-- requires it) and records the adder in added_by.
create or replace function public.add_shared_list_item(
  p_list uuid, p_tmdb_id int, p_media_type text, p_title text,
  p_poster_path text default null, p_genre_ids int[] default '{}')
returns void
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if not public.can_edit_shared_list(p_list) or p_media_type not in ('movie', 'tv') then
    raise exception 'not_allowed';
  end if;
  select user_id into v_owner from public.user_custom_lists where id = p_list;
  insert into public.user_custom_list_items (list_id, user_id, tmdb_id, media_type, title, poster_path, genre_ids, added_by)
    values (p_list, v_owner, p_tmdb_id, p_media_type, coalesce(p_title, ''), p_poster_path, coalesce(p_genre_ids, '{}'), auth.uid())
    on conflict (list_id, tmdb_id) do nothing;
end;
$$;

create or replace function public.remove_shared_list_item(p_list uuid, p_tmdb_id int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_shared_list(p_list) then raise exception 'not_allowed'; end if;
  delete from public.user_custom_list_items where list_id = p_list and tmdb_id = p_tmdb_id;
end;
$$;

-- ── 4. Reads ─────────────────────────────────────────────────────────────────

-- Everyone on the lists the caller owns or is on: the owner and the members,
-- with their identity, for the list header and the member menu.
create or replace function public.list_shared_list_people(p_lists uuid[])
returns table (list_id uuid, user_id uuid, username text, display_name text,
               avatar_url text, is_owner boolean)
language sql stable security definer set search_path = public as $$
  select x.list_id, p.id, p.username, p.display_name, p.avatar_url, x.is_owner
    from (
      select l.id as list_id, l.user_id as uid, true as is_owner
        from public.user_custom_lists l
       where l.id = any (p_lists) and public.can_edit_shared_list(l.id)
         and exists (select 1 from public.user_custom_list_members m where m.list_id = l.id)
      union all
      select m.list_id, m.user_id, false
        from public.user_custom_list_members m
       where m.list_id = any (p_lists) and public.can_edit_shared_list(m.list_id)
    ) x
    join public.profiles p on p.id = x.uid
   where public.not_blocked(x.uid)
$$;

-- Partners who also saved a title the caller has on their watchlist, for the
-- "Saved by Sam too" row on a title page.
create or replace function public.watch_together_savers(p_tmdb_id int, p_media_type text)
returns table (id uuid, username text, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url
    from public.watch_together w
    cross join lateral (
      select case when w.requester_id = auth.uid() then w.recipient_id else w.requester_id end as other_id
    ) o
    join public.profiles p on p.id = o.other_id
   where w.status = 'accepted'
     and auth.uid() in (w.requester_id, w.recipient_id)
     and public.not_blocked(o.other_id)
     and exists (select 1 from public.watchlist_keys(auth.uid()) k where k.tmdb_id = p_tmdb_id and k.media_type = p_media_type)
     and exists (select 1 from public.watchlist_keys(o.other_id) k where k.tmdb_id = p_tmdb_id and k.media_type = p_media_type)
   order by coalesce(p.display_name, p.username)
$$;

-- ── 5. Blocking removes a member from the blocker's or blocked person's lists
create or replace function public.remove_list_members_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.user_custom_list_members m
   using public.user_custom_lists l
   where l.id = m.list_id
     and ((l.user_id = new.blocker_id and m.user_id = new.blocked_id)
       or (l.user_id = new.blocked_id and m.user_id = new.blocker_id));
  return new;
end;
$$;

drop trigger if exists on_user_block_remove_list_members on public.user_blocks;
create trigger on_user_block_remove_list_members
  after insert on public.user_blocks
  for each row execute function public.remove_list_members_on_block();

-- ── 6. Grants ────────────────────────────────────────────────────────────────
revoke all on function public.is_custom_list_member(uuid) from public, anon;
revoke all on function public.can_edit_shared_list(uuid) from public, anon;
revoke all on function public.create_shared_list(text, uuid[], uuid) from public, anon;
revoke all on function public.add_shared_list_member(uuid, uuid) from public, anon;
revoke all on function public.leave_shared_list(uuid) from public, anon;
revoke all on function public.rename_shared_list(uuid, text) from public, anon;
revoke all on function public.add_shared_list_item(uuid, int, text, text, text, int[]) from public, anon;
revoke all on function public.remove_shared_list_item(uuid, int) from public, anon;
revoke all on function public.list_shared_list_people(uuid[]) from public, anon;
revoke all on function public.watch_together_savers(int, text) from public, anon;
grant execute on function public.is_custom_list_member(uuid) to authenticated;
grant execute on function public.can_edit_shared_list(uuid) to authenticated;
grant execute on function public.create_shared_list(text, uuid[], uuid) to authenticated;
grant execute on function public.add_shared_list_member(uuid, uuid) to authenticated;
grant execute on function public.leave_shared_list(uuid) to authenticated;
grant execute on function public.rename_shared_list(uuid, text) to authenticated;
grant execute on function public.add_shared_list_item(uuid, int, text, text, text, int[]) to authenticated;
grant execute on function public.remove_shared_list_item(uuid, int) to authenticated;
grant execute on function public.list_shared_list_people(uuid[]) to authenticated;
grant execute on function public.watch_together_savers(int, text) to authenticated;
