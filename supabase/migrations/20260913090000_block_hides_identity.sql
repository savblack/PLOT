-- Report and block, part 2 of 2: identity.
--
-- Part 1 (20260912130000_report_and_block.sql) hid blocked users' CONTENT by
-- adding `public.not_blocked(user_id)` to nine RLS policies. It deliberately
-- stopped there. This file hides their IDENTITY, which is a completely
-- different mechanism and a far more dangerous change shape.
--
-- Why identity needs its own file:
--
--   `public.profiles` has exactly one select policy — `auth.uid() = id` — so
--   RLS protects nothing here. Every identity read in the product goes through
--   a `security definer` RPC that selects `public.profiles` DIRECTLY, bypassing
--   both RLS and the `public_profiles` view (which nothing queries). Adding a
--   block clause to the view would have done nothing at all.
--
--   That means seven `create or replace function` statements against live user
--   data, each replacing a whole body someone else authored. That is exactly
--   the shape that broke every history write for two weeks in July 2026
--   (see scripts/check-migration-redefinitions.mjs). Every body below was
--   copied from `pg_get_functiondef` against PRODUCTION on 2026-09-13, not
--   from the migration that last defined it — several of these functions have
--   been redefined four or five times and the newest migration file is not the
--   live definition. The ONLY change in each is the added `not_blocked`
--   conjunct, marked `-- + block` on its own line.
--
-- The spec named six functions. `list_notifications` is a seventh, found by
-- asking Postgres which function bodies mention `profiles` rather than trusting
-- the list: a blocked user's old follow/like notifications kept rendering their
-- username and avatar in your notification feed. See the design note in
-- docs/superpowers/specs/2026-09-12-report-and-block-design.md.
--
-- Grants are NOT re-issued below. `create or replace function` preserves the
-- existing ACL, and every one of these already carries the default PUBLIC
-- execute plus explicit anon/authenticated/service_role grants. Re-granting
-- from memory is how you widen something by accident.
--
-- redefines: get_profile_card, search_users, suggested_users, list_followers,
-- redefines: list_following, list_follow_requests, list_notifications
-- (no ON CONFLICT targets anywhere in this file; nothing upserts.)

-- ── 1. The public profile page ───────────────────────────────────────────────
--
-- Returning zero rows makes both apps render their existing not-found state
-- ("This profile isn't public — @x either doesn't exist or hasn't made their
-- profile public yet"), which is byte-identical to what a private or
-- nonexistent handle already shows. That indistinguishability is the point: a
-- distinct "you have been blocked" state would turn blocking into a
-- notification, which is the thing the symmetric design and the unreadable
-- user_blocks table both exist to prevent.

create or replace function public.get_profile_card(p_username text)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_supporter boolean, is_public boolean,
               follow_status text, profile_sections text[], bio text, links jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_supporter, p.is_public,
         (select f.status from public.follows f
            where f.following_id = p.id and f.follower_id = auth.uid()),
         p.profile_sections, p.bio, p.links
  from public.profiles p
  where lower(p.username) = lower(p_username)
    and (p.is_public or auth.uid() is not null)
    and public.not_blocked(p.id)                                    -- + block
$$;

-- ── 2. User search ───────────────────────────────────────────────────────────

create or replace function public.search_users(p_query text)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_supporter boolean, is_public boolean,
               follow_status text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_supporter, p.is_public,
         (select f.status from public.follows f
            where f.following_id = p.id and f.follower_id = auth.uid())
  from public.profiles p
  where length(trim(p_query)) >= 2
    and (p.username ilike trim(p_query) || '%' or p.display_name ilike '%' || trim(p_query) || '%')
    and (p.is_public or auth.uid() is not null)
    and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and public.not_blocked(p.id)                                    -- + block
  order by (p.username ilike trim(p_query) || '%') desc, p.username
  limit 25
$$;

-- ── 3. Suggestion rails ──────────────────────────────────────────────────────

create or replace function public.suggested_users(p_limit integer default 20)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_supporter boolean, is_public boolean,
               follow_status text, post_count bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_supporter, p.is_public,
         null::text as follow_status,
         count(fp.id) as post_count
  from public.profiles p
  left join public.feed_posts fp on fp.author_id = p.id
  where p.is_public
    and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and not exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.following_id = p.id
    )
    and public.not_blocked(p.id)                                    -- + block
  group by p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
           p.is_supporter, p.is_public
  order by count(fp.id) desc, p.username asc
  limit least(coalesce(p_limit, 20), 50)
$$;

-- ── 4. Follower and following lists ──────────────────────────────────────────
--
-- Two conjuncts, not one, and they do different jobs:
--
--   not_blocked(p.id)     hides the blocked user from a list you can see.
--   not_blocked(p_target) hides the list itself when its OWNER is blocked.
--
-- The second is not redundant. Nothing in the app can reach it once
-- get_profile_card returns nothing, but the RPC takes a raw uuid and is
-- granted to anon, so it is callable directly. Without it, blocking someone
-- would hide their name everywhere except the one endpoint that enumerates
-- their entire social graph.
--
-- Both stay correct for your own lists: p_target = auth.uid() there, and
-- user_blocks_no_self makes not_blocked(auth.uid()) unconditionally true.

create or replace function public.list_followers(p_target uuid)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_supporter boolean, is_public boolean,
               follow_status text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_supporter, p.is_public,
         (select f2.status from public.follows f2 where f2.following_id = p.id and f2.follower_id = auth.uid())
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.following_id = p_target and f.status = 'accepted'
    and (public.is_profile_public(p_target) or public.is_accepted_follower(p_target) or auth.uid() = p_target)
    and public.not_blocked(p_target) and public.not_blocked(p.id)   -- + block
  order by f.created_at desc
  limit 200
$$;

create or replace function public.list_following(p_target uuid)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_supporter boolean, is_public boolean,
               follow_status text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_supporter, p.is_public,
         (select f2.status from public.follows f2 where f2.following_id = p.id and f2.follower_id = auth.uid())
  from public.follows f
  join public.profiles p on p.id = f.following_id
  where f.follower_id = p_target and f.status = 'accepted'
    and (public.is_profile_public(p_target) or public.is_accepted_follower(p_target) or auth.uid() = p_target)
    and public.not_blocked(p_target) and public.not_blocked(p.id)   -- + block
  order by f.created_at desc
  limit 200
$$;

-- ── 5. The follow requests screen ────────────────────────────────────────────
--
-- sever_follows_on_block() already deletes pending requests in both directions
-- the moment a block is created, so in practice this returns the same rows
-- either way. It is here because the trigger only fires on insert: a request
-- that arrives AFTER the block (see section 7) must not surface either.

create or replace function public.list_follow_requests()
returns table (follower_id uuid, username text, display_name text,
               avatar_url text, requested_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.follower_id, p.username, p.display_name, p.avatar_url, f.created_at
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.following_id = auth.uid() and f.status = 'pending'
    and public.not_blocked(f.follower_id)                           -- + block
  order by f.created_at desc
$$;

-- ── 6. Notifications ─────────────────────────────────────────────────────────
--
-- The surface the design spec missed. Notifications are historical rows, so
-- blocking someone left every "x started following you" and "x liked your
-- post" in place, complete with their username and avatar — the one place a
-- blocked account stayed fully visible after every other path went dark.

create or replace function public.list_notifications()
returns table (id uuid, type text, actor_id uuid, actor_username text,
               actor_display_name text, actor_avatar_url text, post_id uuid,
               post_title text, post_poster_path text,
               created_at timestamptz, read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select n.id, n.type, n.actor_id, p.username, p.display_name, p.avatar_url,
         n.post_id, fp.title, fp.poster_path, n.created_at, n.read_at
  from public.notifications n
  join public.profiles p on p.id = n.actor_id
  left join public.feed_posts fp on fp.id = n.post_id
  where n.user_id = auth.uid()
    and public.not_blocked(n.actor_id)                              -- + block
  order by n.created_at desc
  limit 50
$$;

-- ── 7. A block must also stop the follow coming back ─────────────────────────
--
-- sever_follows_on_block() deletes the relationship, but nothing stopped the
-- blocked user re-inserting it. The new row was invisible to both parties
-- (the select policy already carries not_blocked in both directions), so it
-- looked harmless — right up until the block was lifted, at which point a
-- follow neither party had re-consented to sprang back into existence. On a
-- private profile that silently restores access to the watchlist and history.
--
-- Recreated WITHOUT a `to` clause, matching the live policy exactly
-- (pg_policies reports roles={public} for every policy on follows; part 1's
-- policies use `to anon, authenticated`, and copying that idiom here would
-- have been a change, not a copy).
--
-- This is the one place blocking is observable to the blocked user: the insert
-- fails rather than silently doing nothing. That is acceptable — by this point
-- the profile has already vanished from every read path, so a direct API
-- caller has nothing left to learn, and the app never reaches it because there
-- is no longer a profile to press Follow on.

drop policy if exists "users can follow others" on public.follows;
create policy "users can follow others" on public.follows
  for insert
  with check (auth.uid() = follower_id and public.not_blocked(following_id));
