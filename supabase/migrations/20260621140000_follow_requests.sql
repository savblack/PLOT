-- Follow requests for private profiles.
--
-- Public profiles: following is instant (status 'accepted').
-- Private profiles: following creates a 'pending' request the owner approves or
-- declines. Approved followers can then read the private profile's content
-- (journal, top lists, favourites) just like a public viewer.
--
-- Builds on 20260621130000 (is_public, is_profile_public, public-read policies).

-- ── 1. status column ────────────────────────────────────────────────────────
-- Existing rows are all real follows → default 'accepted' is correct.
alter table public.follows
  add column if not exists status text not null default 'accepted'
  check (status in ('pending', 'accepted'));

-- ── 2. Server-decided status (clients can't self-approve) ─────────────────────
-- A BEFORE INSERT trigger sets status from the target's privacy, ignoring any
-- client-supplied value: public target → accepted, private target → pending.
create or replace function public.set_follow_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.status := case when public.is_profile_public(new.following_id) then 'accepted' else 'pending' end;
  return new;
end;
$$;
drop trigger if exists trg_set_follow_status on public.follows;
create trigger trg_set_follow_status before insert on public.follows
  for each row execute function public.set_follow_status();

-- ── 3. Accepted-follower check (drives private content access) ────────────────
create or replace function public.is_accepted_follower(p_target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.follows
    where following_id = p_target and follower_id = auth.uid() and status = 'accepted'
  )
$$;
grant execute on function public.is_accepted_follower(uuid) to anon, authenticated;

-- ── 4. follows read: accepted public (counts); pending only to the two parties ─
drop policy if exists "follows are publicly readable" on public.follows;
drop policy if exists "accepted follows are public" on public.follows;
drop policy if exists "pending follows visible to parties" on public.follows;
create policy "accepted follows are public" on public.follows
  for select using (status = 'accepted');
create policy "pending follows visible to parties" on public.follows
  for select using (status = 'pending' and (auth.uid() = follower_id or auth.uid() = following_id));

-- ── 5. Approve (target updates pending→accepted) + decline/remove (target deletes)
drop policy if exists "following can update requests" on public.follows;
create policy "following can update requests" on public.follows
  for update using (auth.uid() = following_id) with check (auth.uid() = following_id);
drop policy if exists "following can remove follower" on public.follows;
create policy "following can remove follower" on public.follows
  for delete using (auth.uid() = following_id);
-- (existing policies retained: follower inserts own; follower deletes own)

-- ── 6. Content access: public profile OR accepted follower ────────────────────
drop policy if exists "public profiles journal is readable" on public.journal;
create policy "public profiles journal is readable" on public.journal
  for select to anon, authenticated
  using (public.is_profile_public(user_id) or public.is_accepted_follower(user_id));

drop policy if exists "public profiles top lists readable" on public.user_top_lists;
create policy "public profiles top lists readable" on public.user_top_lists
  for select to anon, authenticated
  using (public.is_profile_public(user_id) or public.is_accepted_follower(user_id));

drop policy if exists "public profiles favourites readable" on public.user_favourites;
create policy "public profiles favourites readable" on public.user_favourites
  for select to anon, authenticated
  using (public.is_profile_public(user_id) or public.is_accepted_follower(user_id));

-- ── 7. Profile card: minimal header for any profile + the viewer's follow status.
-- Private profiles' header (name/avatar) is exposed only to logged-in users so they
-- can request to follow; anon visitors to a private profile get no row (placeholder).
create or replace function public.get_profile_card(p_username text)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_supporter boolean, is_public boolean, follow_status text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_supporter, p.is_public,
         (select f.status from public.follows f
            where f.following_id = p.id and f.follower_id = auth.uid())
  from public.profiles p
  where lower(p.username) = lower(p_username)
    and (p.is_public or auth.uid() is not null)
$$;
grant execute on function public.get_profile_card(text) to anon, authenticated;

-- ── 8. Owner's incoming pending requests (with requester header) ──────────────
create or replace function public.list_follow_requests()
returns table (follower_id uuid, username text, display_name text,
               avatar_url text, requested_at timestamptz)
language sql security definer stable set search_path = public as $$
  select f.follower_id, p.username, p.display_name, p.avatar_url, f.created_at
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.following_id = auth.uid() and f.status = 'pending'
  order by f.created_at desc
$$;
grant execute on function public.list_follow_requests() to authenticated;
