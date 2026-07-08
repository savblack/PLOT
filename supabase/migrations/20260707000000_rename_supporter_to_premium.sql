-- Rebrand: "Supporter" → "PLOT Premium".
--
-- Renames profiles.is_supporter (added 20260409000000, still all-false in
-- prod — nothing ever set it) to is_premium, and recreates the five applied
-- SQL objects that expose it under the old name. RETURNS TABLE column names
-- can't change via CREATE OR REPLACE, so the functions are dropped first;
-- same for the view's output column. Bodies are copied verbatim from
-- 20260621130000 / 20260621140000 / 20260621150000 apart from the rename.
--
-- Must run BEFORE 20260708000000_add_premium_billing.sql, which builds the
-- entitlement machinery (is_premium(), tamper trigger, list cap) on the
-- renamed column.

-- ── 1. Column ────────────────────────────────────────────────────────────────

drop view if exists public.public_profiles;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'is_supporter'
  ) then
    execute 'alter table public.profiles rename column is_supporter to is_premium';
  end if;
end $$;

-- ── 2. Public profile view (from 20260621130000) ─────────────────────────────

create view public.public_profiles with (security_invoker = off) as
  select id, username, display_name, avatar_url, is_premium
  from public.profiles
  where is_public = true;
grant select on public.public_profiles to anon, authenticated;

-- ── 3. Profile card (from 20260621140000) ────────────────────────────────────

drop function if exists public.get_profile_card(text);
create function public.get_profile_card(p_username text)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_public boolean, follow_status text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium, p.is_public,
         (select f.status from public.follows f
            where f.following_id = p.id and f.follower_id = auth.uid())
  from public.profiles p
  where lower(p.username) = lower(p_username)
    and (p.is_public or auth.uid() is not null)
$$;
grant execute on function public.get_profile_card(text) to anon, authenticated;

-- ── 4. User search + follow lists (from 20260621150000) ──────────────────────

drop function if exists public.search_users(text);
create function public.search_users(p_query text)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_public boolean, follow_status text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium, p.is_public,
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

drop function if exists public.list_followers(uuid);
create function public.list_followers(p_target uuid)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_public boolean, follow_status text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium, p.is_public,
         (select f2.status from public.follows f2 where f2.following_id = p.id and f2.follower_id = auth.uid())
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.following_id = p_target and f.status = 'accepted'
    and (public.is_profile_public(p_target) or public.is_accepted_follower(p_target) or auth.uid() = p_target)
  order by f.created_at desc
  limit 200
$$;
grant execute on function public.list_followers(uuid) to anon, authenticated;

drop function if exists public.list_following(uuid);
create function public.list_following(p_target uuid)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_public boolean, follow_status text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium, p.is_public,
         (select f2.status from public.follows f2 where f2.following_id = p.id and f2.follower_id = auth.uid())
  from public.follows f
  join public.profiles p on p.id = f.following_id
  where f.follower_id = p_target and f.status = 'accepted'
    and (public.is_profile_public(p_target) or public.is_accepted_follower(p_target) or auth.uid() = p_target)
  order by f.created_at desc
  limit 200
$$;
grant execute on function public.list_following(uuid) to anon, authenticated;
