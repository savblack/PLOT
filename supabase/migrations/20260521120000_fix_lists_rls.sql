-- ─────────────────────────────────────────────────────────────────
-- Fix RLS policies on lists + list_items so the watchlist works.
-- Safe to re-run: all policies are dropped then recreated.
-- ─────────────────────────────────────────────────────────────────

-- ── lists ──────────────────────────────────────────────────────────
alter table lists enable row level security;

drop policy if exists "Users can view own lists"   on lists;
drop policy if exists "Users can create own lists" on lists;
drop policy if exists "Users can update own lists" on lists;
drop policy if exists "Users can delete own lists" on lists;

create policy "Users can view own lists"
  on lists for select
  using (auth.uid() = user_id);

create policy "Users can create own lists"
  on lists for insert
  with check (auth.uid() = user_id);

create policy "Users can update own lists"
  on lists for update
  using (auth.uid() = user_id);

create policy "Users can delete own lists"
  on lists for delete
  using (auth.uid() = user_id);

-- ── list_items ─────────────────────────────────────────────────────
alter table list_items enable row level security;

drop policy if exists "Users can view own list items"   on list_items;
drop policy if exists "Users can create own list items" on list_items;
drop policy if exists "Users can delete own list items" on list_items;

create policy "Users can view own list items"
  on list_items for select
  using (auth.uid() = user_id);

create policy "Users can create own list items"
  on list_items for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own list items"
  on list_items for delete
  using (auth.uid() = user_id);
