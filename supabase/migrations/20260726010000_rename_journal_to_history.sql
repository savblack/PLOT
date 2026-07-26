-- Rename the `journal` table to `history`: the product is dropping the
-- "journal" framing in favor of plain watch history. Structural rename only —
-- no data is touched, dropped, or recreated. Every dependent object (default
-- pkey/sequence names, the rewatch-uniqueness constraint, the public-read RLS
-- policy, and the feed-sync trigger/function) is renamed to match so nothing
-- in the schema still says "journal" once this lands.
--
-- Wrapped in guarded DO blocks (checked against the catalogs) so this is safe
-- to run even if an object's default name doesn't match what we expect here —
-- this is a live production database with real user data.

alter table if exists public.journal rename to history;

-- Primary key constraint (default name from the original `create table journal`).
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'journal_pkey'
  ) and not exists (
    select 1 from pg_constraint where conname = 'history_pkey'
  ) then
    alter table public.history rename constraint journal_pkey to history_pkey;
  end if;
end $$;

-- Backing sequence for the pkey, if the id column uses one (serial/bigserial).
do $$
begin
  if exists (
    select 1 from pg_class where relkind = 'S' and relname = 'journal_id_seq'
  ) and not exists (
    select 1 from pg_class where relkind = 'S' and relname = 'history_id_seq'
  ) then
    alter sequence public.journal_id_seq rename to history_id_seq;
  end if;
end $$;

-- Rewatch-uniqueness constraint added in 20260725000001_preserve_repeat_watches.sql.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'journal_user_id_tmdb_id_watched_at_key'
  ) and not exists (
    select 1 from pg_constraint where conname = 'history_user_id_tmdb_id_watched_at_key'
  ) then
    alter table public.history
      rename constraint journal_user_id_tmdb_id_watched_at_key
      to history_user_id_tmdb_id_watched_at_key;
  end if;
end $$;

-- Any remaining indexes/constraints on `history` that still have "journal" in
-- their name (defensive catch-all for names not enumerated above).
do $$
declare
  rec record;
  new_name text;
begin
  for rec in
    select conname from pg_constraint
    where conrelid = 'public.history'::regclass and conname like '%journal%'
  loop
    new_name := replace(rec.conname, 'journal', 'history');
    execute format('alter table public.history rename constraint %I to %I', rec.conname, new_name);
  end loop;

  for rec in
    select indexname from pg_indexes
    where schemaname = 'public' and tablename = 'history' and indexname like '%journal%'
  loop
    new_name := replace(rec.indexname, 'journal', 'history');
    execute format('alter index public.%I rename to %I', rec.indexname, new_name);
  end loop;
end $$;

-- RLS policy from 20260621130000_public_profiles.sql / 20260621140000_follow_requests.sql.
drop policy if exists "public profiles journal is readable" on public.history;
create policy "public profiles history is readable" on public.history
  for select to anon, authenticated
  using (public.is_profile_public(user_id) or public.is_accepted_follower(user_id));

-- Feed-sync trigger/function from 20260718000000_feed_posts.sql (updated by
-- 20260725000001_preserve_repeat_watches.sql, 20260718120000_feed_post_types.sql).
drop trigger if exists trg_feed_post_from_journal on public.history;

alter function public.feed_post_from_journal() rename to feed_post_from_history;

create trigger trg_feed_post_from_history after insert or update or delete on public.history
  for each row execute function public.feed_post_from_history();
