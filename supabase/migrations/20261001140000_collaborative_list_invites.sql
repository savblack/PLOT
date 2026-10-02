-- Collaborative lists: the host needs Premium, friends join free (PLO-525).
-- Builds on 20260927120000_watch_together_shared_lists.sql.
--
-- Until now a shared list could only take people you already watch together
-- with. The plans page promises more: "Start a collaborative list ... and
-- invite anyone. Friends can add ideas with a free account." So:
--
-- 1. Invite links. The list owner gets one reusable link per list, carrying a
--    random key, the same shape as watch_together_links. Anyone signed in who
--    opens it can join as a member, Free or Premium. Sharing the link is the
--    owner's consent; accepting is the visitor's. Resetting the key retires
--    links already sent.
-- 2. Hosting needs Premium, checked on the list OWNER, never on the person
--    joining. Getting a link, accepting a link and adding someone to a list
--    all need the owner to have Premium. create_shared_list already required
--    it (the caller is the owner there), so it is unchanged.
--
-- Grandfathering: nothing here touches existing lists, members or items, and
-- editing (rename, add and remove titles, leave) stays open to everyone
-- already on a list whatever the owner's plan. Only growing a list (a new
-- member) needs a Premium host. So a list whose owner is on Free, or later
-- lapses, keeps working for the people on it; it just can't take new people.
--
-- Additive: one table, five new functions. add_shared_list_member is
-- recreated from its only body (20260927120000) with one added line.
--
-- Renumbered from 20260928160000 to 20261001140000 (twice): by the time this merges,
-- main had applied newer migrations (20261001120000), and an older version
-- would be skipped. It must sort after main's newest migration when it lands.

-- ── 1. Invite links ──────────────────────────────────────────────────────────
create table if not exists public.user_custom_list_invites (
  list_id    uuid primary key references public.user_custom_lists(id) on delete cascade,
  invite_key text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.user_custom_list_invites enable row level security;
-- No client policies: every read and write goes through the functions below.

-- The caller is on the list (owner or member) and its owner has Premium, so
-- the client can say whether "Add people" will work. False for anyone else.
create or replace function public.list_host_is_premium(p_list uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.is_premium(l.user_id)
      from public.user_custom_lists l
     where l.id = p_list and public.can_edit_shared_list(l.id)
  ), false)
$$;

-- The list's invite key, made on first use. Owner only, and the owner needs
-- Premium. Reuses new_watch_together_link_key() for the random key.
create or replace function public.my_list_invite(p_list uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_key text;
begin
  if auth.uid() is null
     or not exists (select 1 from public.user_custom_lists where id = p_list and user_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;
  if not public.is_premium() then raise exception 'premium_required'; end if;
  select invite_key into v_key from public.user_custom_list_invites where list_id = p_list;
  if v_key is null then
    insert into public.user_custom_list_invites (list_id, invite_key, created_by)
      values (p_list, public.new_watch_together_link_key(), auth.uid())
      on conflict (list_id) do nothing;
    select invite_key into v_key from public.user_custom_list_invites where list_id = p_list;
  end if;
  return v_key;
end;
$$;

-- A new key; links shared before stop working. Owner only. No Premium check:
-- retiring a link must always be possible, and accepting is gated anyway.
create or replace function public.reset_list_invite(p_list uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_key text := public.new_watch_together_link_key();
begin
  if auth.uid() is null
     or not exists (select 1 from public.user_custom_lists where id = p_list and user_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;
  insert into public.user_custom_list_invites (list_id, invite_key, created_by)
    values (p_list, v_key, auth.uid())
    on conflict (list_id) do update set invite_key = excluded.invite_key, created_at = now();
  return v_key;
end;
$$;

-- What an invite link points at, for the landing page. Readable signed out,
-- because the person opening it may not have an account yet. Returns nothing
-- for an unknown key or a blocked owner. list_id is only returned to someone
-- already on the list. state: 'owner', 'member', 'none', or null signed out.
-- host_premium false means the link can't be accepted right now.
create or replace function public.list_invite_preview(p_key text)
returns table (list_id uuid, list_name text, item_count int,
               owner_id uuid, username text, display_name text, avatar_url text,
               host_premium boolean, state text)
language sql stable security definer set search_path = public as $$
  select case when auth.uid() = l.user_id or m.user_id is not null then l.id end,
         l.name,
         (select count(*)::int from public.user_custom_list_items i where i.list_id = l.id),
         p.id, p.username, p.display_name, p.avatar_url,
         public.is_premium(l.user_id),
         case when auth.uid() is null then null
              when auth.uid() = l.user_id then 'owner'
              when m.user_id is not null then 'member'
              else 'none' end
    from public.user_custom_list_invites k
    join public.user_custom_lists l on l.id = k.list_id
    join public.profiles p on p.id = l.user_id
    left join public.user_custom_list_members m on m.list_id = l.id and m.user_id = auth.uid()
   where k.invite_key = p_key
     and public.not_blocked(l.user_id)
$$;

-- Accept an invite link: the caller joins the list as a member, free. The
-- owner must have Premium. Returns the list id (also when already on it).
-- Raises not_allowed or premium_required.
create or replace function public.accept_list_invite(p_key text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_list uuid;
  v_owner uuid;
  v_by uuid;
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  select l.id, l.user_id, k.created_by into v_list, v_owner, v_by
    from public.user_custom_list_invites k
    join public.user_custom_lists l on l.id = k.list_id
   where k.invite_key = p_key;
  if v_list is null or not public.not_blocked(v_owner) then raise exception 'not_allowed'; end if;
  if v_owner = auth.uid() then return v_list; end if;
  if exists (select 1 from public.user_custom_list_members where list_id = v_list and user_id = auth.uid()) then
    return v_list;
  end if;
  if not public.is_premium(v_owner) then raise exception 'premium_required'; end if;
  insert into public.user_custom_list_members (list_id, user_id, added_by)
    values (v_list, auth.uid(), coalesce(v_by, v_owner))
    on conflict do nothing;
  return v_list;
end;
$$;

-- ── 2. Adding someone needs a Premium host ───────────────────────────────────
-- redefines: add_shared_list_member (adds the owner Premium check; body
-- otherwise identical to 20260927120000, its only definition)
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
  if not public.is_premium(v_owner) then raise exception 'premium_required'; end if;
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

-- ── 3. Grants ────────────────────────────────────────────────────────────────
revoke all on function public.list_host_is_premium(uuid) from public, anon;
revoke all on function public.my_list_invite(uuid) from public, anon;
revoke all on function public.reset_list_invite(uuid) from public, anon;
revoke all on function public.list_invite_preview(text) from public;
revoke all on function public.accept_list_invite(text) from public, anon;
grant execute on function public.list_host_is_premium(uuid) to authenticated;
grant execute on function public.my_list_invite(uuid) to authenticated;
grant execute on function public.reset_list_invite(uuid) to authenticated;
grant execute on function public.list_invite_preview(text) to anon, authenticated;
grant execute on function public.accept_list_invite(text) to authenticated;
