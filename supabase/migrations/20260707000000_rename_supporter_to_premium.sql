-- Rebrand: "Supporter" → "PLOT Premium" (transitional, zero-downtime).
--
-- Adds profiles.is_premium alongside is_supporter instead of renaming it,
-- because this migration is applied while the previous frontend deploy —
-- which selects is_supporter by name (App.jsx profile select, api/profile.js,
-- api/og.js) — is still live. The five applied SQL objects that exposed the
-- flag are recreated to return BOTH columns, so old and new clients (web +
-- plot-mobile) work on either side of the deploy. A follow-up cleanup
-- migration drops is_supporter and the legacy fields once the Premium
-- frontend deploy has settled.
--
-- Nothing has ever set is_supporter = true (the badge shipped without a
-- granting mechanism), so the copy below is belt-and-braces.
--
-- Must run BEFORE 20260708000000_add_premium_billing.sql, which builds the
-- entitlement machinery (is_premium(), tamper trigger, list cap) on the new
-- column.

-- ── 1. Column ────────────────────────────────────────────────────────────────

alter table public.profiles add column if not exists is_premium boolean default false;
update public.profiles set is_premium = is_supporter
  where is_supporter is distinct from is_premium;

-- ── 2. Public profile view (from 20260621130000; + is_premium) ───────────────

drop view if exists public.public_profiles;
create view public.public_profiles with (security_invoker = off) as
  select id, username, display_name, avatar_url, is_supporter, is_premium
  from public.profiles
  where is_public = true;
grant select on public.public_profiles to anon, authenticated;

-- ── 3. Profile card (from 20260621140000; + is_premium) ──────────────────────

drop function if exists public.get_profile_card(text);
create function public.get_profile_card(p_username text)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_supporter boolean, is_premium boolean, is_public boolean,
               follow_status text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_supporter,
         p.is_premium, p.is_public,
         (select f.status from public.follows f
            where f.following_id = p.id and f.follower_id = auth.uid())
  from public.profiles p
  where lower(p.username) = lower(p_username)
    and (p.is_public or auth.uid() is not null)
$$;
grant execute on function public.get_profile_card(text) to anon, authenticated;

-- ── 4. User search + follow lists (from 20260621150000; + is_premium) ────────

drop function if exists public.search_users(text);
create function public.search_users(p_query text)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_supporter boolean, is_premium boolean, is_public boolean,
               follow_status text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_supporter,
         p.is_premium, p.is_public,
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
               is_supporter boolean, is_premium boolean, is_public boolean,
               follow_status text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_supporter,
         p.is_premium, p.is_public,
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
               is_supporter boolean, is_premium boolean, is_public boolean,
               follow_status text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_supporter,
         p.is_premium, p.is_public,
         (select f2.status from public.follows f2 where f2.following_id = p.id and f2.follower_id = auth.uid())
  from public.follows f
  join public.profiles p on p.id = f.following_id
  where f.follower_id = p_target and f.status = 'accepted'
    and (public.is_profile_public(p_target) or public.is_accepted_follower(p_target) or auth.uid() = p_target)
  order by f.created_at desc
  limit 200
$$;
grant execute on function public.list_following(uuid) to anon, authenticated;
