-- Report and block, part 1 of 2: content visibility and the report pipeline.
--
-- App Store Guideline 1.2 requires a way to report offensive content and a way
-- to block abusive users. docs/research/app-store-guideline-1-2.md establishes
-- that it applies to PLOT with or without the feed, because avatars, usernames
-- and bios are user-generated content on their own. Design and the reasoning
-- behind the split live in docs/superpowers/specs/2026-09-12-report-and-block-design.md.
--
-- Part 2 (identity hiding) is deliberately NOT here. It redefines six existing
-- security definer RPCs, which is the change shape that broke every history
-- write for two weeks in July, and it deserves its own migration and its own
-- staging pass. Everything below is additive: two tables, three new functions,
-- two triggers, and policy replacements. No existing function is redefined.

-- ── 1. Blocks ────────────────────────────────────────────────────────────────

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

-- Enforcement looks up by the blocked party as often as the blocker.
create index if not exists user_blocks_blocked_id_idx on public.user_blocks(blocked_id);

alter table public.user_blocks enable row level security;

-- Only the blocker ever reads their own rows. The blocked user must never be
-- able to read this table: if they could, blocking would become a notification.
-- That is also why enforcement below goes through a security definer helper
-- rather than an inline subquery in each policy.
drop policy if exists "own blocks readable" on public.user_blocks;
create policy "own blocks readable" on public.user_blocks
  for select to authenticated using (auth.uid() = blocker_id);

drop policy if exists "users can block" on public.user_blocks;
create policy "users can block" on public.user_blocks
  for insert to authenticated with check (auth.uid() = blocker_id);

drop policy if exists "users can unblock" on public.user_blocks;
create policy "users can unblock" on public.user_blocks
  for delete to authenticated using (auth.uid() = blocker_id);

-- Symmetric on purpose: "sever the relationship" means neither party sees the
-- other, not merely that the blocker stops seeing the blocked user.
--
-- Returns TRUE when the viewer may still see p_uid's content. Phrased in the
-- positive so call sites read as `and public.not_blocked(user_id)` rather than
-- stacking a negation onto predicates that already contain one.
--
-- Anonymous readers are unaffected: auth.uid() is null, the comparisons match
-- nothing, and the function returns true.
create or replace function public.not_blocked(p_uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select not exists (
    select 1 from public.user_blocks
    where (blocker_id = p_uid       and blocked_id = auth.uid())
       or (blocker_id = auth.uid()  and blocked_id = p_uid)
  )
$$;
grant execute on function public.not_blocked(uuid) to anon, authenticated;

comment on function public.not_blocked(uuid) is
  'True when the current viewer is not blocked by, and has not blocked, p_uid. Symmetric. Used as an extra conjunct on every public-read policy; see 2026-09-12-report-and-block-design.md.';

-- Blocking severs the relationship at the data layer, not just in the UI. The
-- follows table carries `status`, so one statement drops accepted follows AND
-- cancels pending requests, in both directions. A trigger rather than client
-- code, so it cannot be skipped by whichever app forgets.
create or replace function public.sever_follows_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.follows
   where (follower_id = new.blocker_id and following_id = new.blocked_id)
      or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end;
$$;

drop trigger if exists on_user_block_insert on public.user_blocks;
create trigger on_user_block_insert
  after insert on public.user_blocks
  for each row execute function public.sever_follows_on_block();

-- The settings screen has to render the people you have blocked, or you cannot
-- unblock them — and because enforcement is symmetric, the ordinary identity
-- paths return nothing for exactly those users. This deliberately bypasses the
-- filter, scoped to rows the caller owns. It stays correct after part 2.
create or replace function public.list_blocked_users()
returns table (id uuid, username text, display_name text, avatar_url text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, b.created_at
    from public.user_blocks b
    join public.profiles p on p.id = b.blocked_id
   where b.blocker_id = auth.uid()
   order by b.created_at desc
$$;
grant execute on function public.list_blocked_users() to authenticated;

-- ── 2. Content visibility ────────────────────────────────────────────────────
--
-- Each policy below keeps its EXISTING predicate verbatim and gains one
-- conjunct. It is deliberately not refactored onto a shared wrapper: two of
-- these (list_items, watching_progress) gate on is_profile_public alone, while
-- the rest also allow accepted followers. Folding them into one helper would
-- have silently WIDENED those two, handing accepted followers the watchlist and
-- watching progress of private profiles. Blocking is not the change to smuggle
-- a visibility change through.

drop policy if exists "public profiles history is readable" on public.history;
create policy "public profiles history is readable" on public.history
  for select to anon, authenticated
  using ((public.is_profile_public(user_id) or public.is_accepted_follower(user_id))
         and public.not_blocked(user_id));

drop policy if exists "public profiles favourites readable" on public.user_favourites;
create policy "public profiles favourites readable" on public.user_favourites
  for select to anon, authenticated
  using ((public.is_profile_public(user_id) or public.is_accepted_follower(user_id))
         and public.not_blocked(user_id));

drop policy if exists "public profiles top lists readable" on public.user_top_lists;
create policy "public profiles top lists readable" on public.user_top_lists
  for select to anon, authenticated
  using ((public.is_profile_public(user_id) or public.is_accepted_follower(user_id))
         and public.not_blocked(user_id));

drop policy if exists "public profiles list items readable" on public.list_items;
create policy "public profiles list items readable" on public.list_items
  for select to anon, authenticated
  using (public.is_profile_public(user_id) and public.not_blocked(user_id));

drop policy if exists "public profiles watching progress readable" on public.watching_progress;
create policy "public profiles watching progress readable" on public.watching_progress
  for select to anon, authenticated
  using (public.is_profile_public(user_id) and public.not_blocked(user_id));

drop policy if exists "Public custom lists are readable" on public.user_custom_lists;
create policy "Public custom lists are readable" on public.user_custom_lists
  for select using (is_public = true and public.not_blocked(user_id));

-- Reaches the owner through the parent list, which is the only place it exists.
drop policy if exists "Items of public custom lists are readable" on public.user_custom_list_items;
create policy "Items of public custom lists are readable" on public.user_custom_list_items
  for select using (
    exists (
      select 1 from public.user_custom_lists l
       where l.id = user_custom_list_items.list_id
         and l.is_public = true
         and public.not_blocked(l.user_id)
    )
  );

-- follows does not use the visibility helpers — its predicate is just the
-- status — so without this a blocked user could still enumerate the blocker's
-- followers and following. Both sides are checked because a row names two
-- people and either may be the blocker.
drop policy if exists "accepted follows are public" on public.follows;
create policy "accepted follows are public" on public.follows
  for select using (
    status = 'accepted'
    and public.not_blocked(follower_id)
    and public.not_blocked(following_id)
  );

-- "pending follows visible to parties" is left exactly as it is: it already
-- restricts rows to the two people involved, and the trigger above deletes any
-- pending row between a newly blocked pair.

-- ── 3. Reports ───────────────────────────────────────────────────────────────

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  -- set null, not cascade: the evidence should outlive the reporter deleting
  -- their account.
  reporter_id uuid references auth.users(id) on delete set null,
  reported_id uuid not null references auth.users(id) on delete cascade,
  surface     text not null check (surface in ('profile','follow_request','search_result','suggested_user')),
  -- Mirrors Guideline 1.1's categories so PLOT's taxonomy and Apple's line up.
  reason      text not null check (reason in ('harassment','hate','sexual','impersonation','spam','other')),
  detail      text check (char_length(detail) <= 2000),
  status      text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at  timestamptz not null default now()
);

create index if not exists reports_reported_id_idx on public.reports(reported_id);
create index if not exists reports_status_idx on public.reports(status) where status = 'open';

alter table public.reports enable row level security;

-- A reporter sees only their own reports. Nobody reads anyone else's through
-- the API; the operator reads with the service role.
drop policy if exists "own reports readable" on public.reports;
create policy "own reports readable" on public.reports
  for select to authenticated using (auth.uid() = reporter_id);

drop policy if exists "users can report" on public.reports;
create policy "users can report" on public.reports
  for insert to authenticated with check (auth.uid() = reporter_id and reporter_id <> reported_id);

-- Reuses the existing feedback pipeline shape: bearer and base URL from Vault,
-- never raises, so a missing operational secret cannot break a user-facing
-- write. Note the standing caveat that http_request triggers are not reliably
-- transactional, which is why db:write-paths does not write-and-rollback.
drop trigger if exists on_report_insert on public.reports;
create trigger on_report_insert
  after insert on public.reports
  for each row execute function public.notify_edge_function('notify-report');
