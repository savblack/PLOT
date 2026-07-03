-- Public custom lists.
--
-- Custom lists are private by default (owner-only RLS from
-- 20260524000001_add_user_lists_tables.sql). This adds an opt-in `is_public`
-- flag and permissive SELECT policies so that ONLY public lists — and the items
-- of public lists — are readable by anyone (anon included). Writes stay
-- owner-only via the existing "Users manage own custom lists/items" policies;
-- RLS policies are OR'd, so these additive SELECT policies never widen write
-- access and never expose a private list.

alter table user_custom_lists
  add column if not exists is_public boolean not null default false;

-- A public list is readable by anyone (in addition to the owner-manage policy).
-- Idempotent (drop-if-exists) so a later `supabase db push` re-applying this
-- migration is harmless.
drop policy if exists "Public custom lists are readable" on user_custom_lists;
create policy "Public custom lists are readable"
  on user_custom_lists for select
  using (is_public = true);

-- Items belonging to a public list are readable by anyone.
drop policy if exists "Items of public custom lists are readable" on user_custom_list_items;
create policy "Items of public custom lists are readable"
  on user_custom_list_items for select
  using (
    exists (
      select 1 from user_custom_lists l
      where l.id = user_custom_list_items.list_id
        and l.is_public = true
    )
  );

-- Lookup path for the public list page (id is the PK, already indexed). Index
-- the public flag for the sitemap enumeration of public lists.
create index if not exists user_custom_lists_is_public_idx
  on user_custom_lists (is_public)
  where is_public = true;
