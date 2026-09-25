-- One visibility rule for everything on a profile, and per-list visibility.
--
-- Before this, profile content was gated three different ways:
--   * history, top lists, favourites: public profile OR accepted follower
--   * list_items (Want to Watch), watching_progress: public profile ONLY.
--     20260726000000 said it "matched the existing pattern" for top lists, but
--     top lists had already gained accepted followers, so it did not.
--   * custom lists: their own is_public flag, independent of profile privacy,
--     so a private profile's "public" list was readable by anyone.
-- And feed_posts (which copies ratings and review text) never gained the block
-- clause 20260912130000 added everywhere else.
--
-- The model (approved by Savannah, 2026-09-25):
--   * can_view_profile(uid) = owner, OR public profile, OR accepted follower,
--     AND not blocked in either direction. It governs every piece of profile
--     content. Private title notes are NOT profile content and stay owner-only.
--   * Each custom list has a visibility:
--       private    owner only
--       followers  owner + accepted followers
--       public     whoever can view the profile (so capped by profile privacy)
--       link       anyone with the link who isn't blocked; kept off the
--                  profile and out of the sitemap by the clients
--
-- What changes for existing users:
--   * WIDENS: accepted followers of a private profile can now read its
--     Want to Watch and Watching progress. Intended.
--   * NARROWS: blocked users lose feed_posts and the public_profiles view.
--   * NARROWS: every existing public custom list becomes 'public', so on a
--     private profile it is now followers-only and its share link stops
--     working for anyone else. Accepted by Savannah: too few profile viewers
--     for a special case to be worth it.
--
-- Non-destructive: no column or policy is dropped without an equivalent
-- replacement, and is_public is kept (and kept in sync) so app builds that
-- still write it keep working.

-- 1. The one building block ---------------------------------------------------
-- Security invoker: each helper it calls is already security definer, so this
-- wrapper needs no privileges of its own. coalesce because auth.uid() is null
-- for anon, and a null here would read as "unknown", not "no".
create or replace function public.can_view_profile(p_uid uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select (coalesce(p_uid = auth.uid(), false)
          or public.is_profile_public(p_uid)
          or public.is_accepted_follower(p_uid))
     and public.not_blocked(p_uid);
$$;

revoke execute on function public.can_view_profile(uuid) from public;
grant execute on function public.can_view_profile(uuid) to anon, authenticated;

comment on function public.can_view_profile(uuid) is
  'Who can read profile content: owner, anyone if the profile is public, accepted followers if private; never across a block. Every profile-content read policy uses this.';

-- 2. Profile content policies -------------------------------------------------
-- Same policy names and roles as 20260912130000, so this replaces rather than
-- stacks. history/favourites/top lists are behaviour-identical (the owner term
-- is new, but owners already had their own policy). list_items and
-- watching_progress widen to accepted followers.

drop policy if exists "public profiles history is readable" on public.history;
create policy "public profiles history is readable" on public.history
  for select to anon, authenticated
  using (public.can_view_profile(user_id));

drop policy if exists "public profiles favourites readable" on public.user_favourites;
create policy "public profiles favourites readable" on public.user_favourites
  for select to anon, authenticated
  using (public.can_view_profile(user_id));

drop policy if exists "public profiles top lists readable" on public.user_top_lists;
create policy "public profiles top lists readable" on public.user_top_lists
  for select to anon, authenticated
  using (public.can_view_profile(user_id));

drop policy if exists "public profiles list items readable" on public.list_items;
create policy "public profiles list items readable" on public.list_items
  for select to anon, authenticated
  using (public.can_view_profile(user_id));

drop policy if exists "public profiles watching progress readable" on public.watching_progress;
create policy "public profiles watching progress readable" on public.watching_progress
  for select to anon, authenticated
  using (public.can_view_profile(user_id));

-- The owner term was already here; the block clause was not.
drop policy if exists "feed posts visible by profile visibility" on public.feed_posts;
create policy "feed posts visible by profile visibility" on public.feed_posts
  for select to anon, authenticated
  using (public.can_view_profile(author_id));

-- 3. Custom list visibility ---------------------------------------------------
alter table public.user_custom_lists
  add column if not exists visibility text not null default 'private';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'user_custom_lists_visibility_check'
       and conrelid = 'public.user_custom_lists'::regclass
  ) then
    alter table public.user_custom_lists
      add constraint user_custom_lists_visibility_check
      check (visibility in ('private', 'followers', 'public', 'link'));
  end if;
end $$;

-- Public lists become 'public' (see header). Only touches rows still at the
-- column default, so re-running it never overwrites a choice made since.
update public.user_custom_lists
   set visibility = 'public'
 where is_public = true
   and visibility = 'private';

-- Keep the two columns agreeing in both directions. Newer clients write
-- visibility; builds already in people's hands write is_public. is_public
-- keeps its old meaning, "reachable by a share link" (public or link), which
-- is what the share button in those builds checks.
create or replace function public.sync_custom_list_visibility()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.visibility <> 'private' then
      new.is_public := new.visibility in ('public', 'link');
    elsif new.is_public then
      new.visibility := 'public';
    end if;
  elsif new.visibility is distinct from old.visibility then
    new.is_public := new.visibility in ('public', 'link');
  elsif new.is_public is distinct from old.is_public then
    new.visibility := case when new.is_public then 'public' else 'private' end;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_custom_list_visibility on public.user_custom_lists;
create trigger sync_custom_list_visibility
  before insert or update on public.user_custom_lists
  for each row execute function public.sync_custom_list_visibility();

create or replace function public.can_view_custom_list(p_owner uuid, p_visibility text)
returns boolean
language sql
stable
set search_path = public
as $$
  select case p_visibility
    when 'public'    then public.can_view_profile(p_owner)
    when 'followers' then (coalesce(p_owner = auth.uid(), false)
                           or public.is_accepted_follower(p_owner))
                          and public.not_blocked(p_owner)
    when 'link'      then public.not_blocked(p_owner)
    else false
  end;
$$;

revoke execute on function public.can_view_custom_list(uuid, text) from public;
grant execute on function public.can_view_custom_list(uuid, text) to anon, authenticated;

-- Same names and (absent) role clauses as 20260912130000. Owners keep reading
-- their private lists through "Users read own custom lists" (20260708000000).
drop policy if exists "Public custom lists are readable" on public.user_custom_lists;
create policy "Public custom lists are readable" on public.user_custom_lists
  for select using (public.can_view_custom_list(user_id, visibility));

drop policy if exists "Items of public custom lists are readable" on public.user_custom_list_items;
create policy "Items of public custom lists are readable" on public.user_custom_list_items
  for select using (
    exists (
      select 1 from public.user_custom_lists l
       where l.id = user_custom_list_items.list_id
         and public.can_view_custom_list(l.user_id, l.visibility)
    )
  );

-- The sitemap enumerates visibility = 'public'. The old is_public index stays;
-- dropping it buys nothing and older readers still filter on is_public.
create index if not exists user_custom_lists_visibility_public_idx
  on public.user_custom_lists (visibility)
  where visibility = 'public';

-- 4. public_profiles honours blocks -------------------------------------------
-- Same columns, same options as 20260802000000; only the where clause grows.
-- not_blocked reads auth.uid() from the request, which still works inside a
-- security_invoker = off view.
create or replace view public.public_profiles
  with (security_invoker = off, security_barrier = true) as
  select id, username, display_name, avatar_url, is_premium, is_supporter
  from public.profiles
  where is_public = true
    and public.not_blocked(id);

comment on view public.public_profiles is
  'Intentional SECURITY DEFINER public projection. Exposes only id, username, display_name, avatar_url, is_premium and is_supporter where is_public = true and the viewer is not blocked either way. profiles remains RLS-protected; changes require privacy review.';
