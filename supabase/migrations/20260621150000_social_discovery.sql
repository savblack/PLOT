-- Social discovery + notifications: user search, follower/following lists, and a
-- notifications system (so people can find each other, follow, and learn when a
-- request is accepted). Builds on 20260621130000 / 20260621140000.

-- ── 1. User search ──────────────────────────────────────────────────────────
-- Find people by username/display name. Logged-in users can find anyone (so they
-- can request private accounts); anon only finds public profiles. Returns the
-- viewer's follow_status so the UI can show Follow / Requested / Following.
create or replace function public.search_users(p_query text)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_supporter boolean, is_public boolean, follow_status text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_supporter, p.is_public,
         (select f.status from public.follows f
            where f.following_id = p.id and f.follower_id = auth.uid())
  from public.profiles p
  where length(trim(p_query)) >= 2
    and (p.username ilike trim(p_query) || '%' or p.display_name ilike '%' || trim(p_query) || '%')
    and (p.is_public or auth.uid() is not null)
    and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  order by (p.username ilike trim(p_query) || '%') desc, p.username
  limit 25
$$;
grant execute on function public.search_users(text) to anon, authenticated;

-- ── 2. Follower / following lists ─────────────────────────────────────────────
-- Visible for public profiles, the owner, or accepted followers (mirrors content
-- visibility). Each row carries the viewer's follow_status toward that person.
create or replace function public.list_followers(p_target uuid)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_supporter boolean, is_public boolean, follow_status text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_supporter, p.is_public,
         (select f2.status from public.follows f2 where f2.following_id = p.id and f2.follower_id = auth.uid())
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.following_id = p_target and f.status = 'accepted'
    and (public.is_profile_public(p_target) or public.is_accepted_follower(p_target) or auth.uid() = p_target)
  order by f.created_at desc
  limit 200
$$;
grant execute on function public.list_followers(uuid) to anon, authenticated;

create or replace function public.list_following(p_target uuid)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_supporter boolean, is_public boolean, follow_status text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_supporter, p.is_public,
         (select f2.status from public.follows f2 where f2.following_id = p.id and f2.follower_id = auth.uid())
  from public.follows f
  join public.profiles p on p.id = f.following_id
  where f.follower_id = p_target and f.status = 'accepted'
    and (public.is_profile_public(p_target) or public.is_accepted_follower(p_target) or auth.uid() = p_target)
  order by f.created_at desc
  limit 200
$$;
grant execute on function public.list_following(uuid) to anon, authenticated;

-- ── 3. Notifications ──────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,   -- recipient
  type       text not null check (type in ('follow_request', 'follow_accepted', 'new_follower')),
  actor_id   uuid not null references auth.users (id) on delete cascade,   -- who triggered it
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
-- Recipients read / mark-read / delete their own. Inserts happen only via the
-- SECURITY DEFINER trigger below (no insert policy → clients can't forge them).
drop policy if exists "own notifications readable" on public.notifications;
create policy "own notifications readable" on public.notifications
  for select using (auth.uid() = user_id);
drop policy if exists "own notifications updatable" on public.notifications;
create policy "own notifications updatable" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own notifications deletable" on public.notifications;
create policy "own notifications deletable" on public.notifications
  for delete using (auth.uid() = user_id);

-- Emit notifications from follow events.
create or replace function public.notify_follow_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      insert into public.notifications (user_id, type, actor_id)
        values (new.following_id, 'follow_request', new.follower_id);
    elsif new.status = 'accepted' then  -- instant follow of a public profile
      insert into public.notifications (user_id, type, actor_id)
        values (new.following_id, 'new_follower', new.follower_id);
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'pending' and new.status = 'accepted' then  -- request approved
      insert into public.notifications (user_id, type, actor_id)
        values (new.follower_id, 'follow_accepted', new.following_id);
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_notify_follow on public.follows;
create trigger trg_notify_follow after insert or update on public.follows
  for each row execute function public.notify_follow_event();

-- Enriched list (joins the actor's profile, which clients can't read directly).
create or replace function public.list_notifications()
returns table (id uuid, type text, actor_id uuid, actor_username text,
               actor_display_name text, actor_avatar_url text,
               created_at timestamptz, read_at timestamptz)
language sql security definer stable set search_path = public as $$
  select n.id, n.type, n.actor_id, p.username, p.display_name, p.avatar_url, n.created_at, n.read_at
  from public.notifications n
  join public.profiles p on p.id = n.actor_id
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit 50
$$;
grant execute on function public.list_notifications() to authenticated;
