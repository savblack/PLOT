-- Add the unique (user_id, name) that `lists` has always been treated as having.
--
-- Three code paths create the default "My List" lazily, and all of them assume
-- a user cannot end up with two lists of the same name:
--   * packages/core/onboarding.js getOrCreateMyListId reads, inserts, and
--     catches 23505 to re-read when another flow won the race. With no
--     constraint that insert simply succeeds, so the branch is unreachable and
--     the race creates a duplicate list instead of resolving to one.
--   * packages/core/useWatchlist.js bootstrap does the same read-then-insert.
--   * apps/mobile/app/(app)/index.tsx upserts on conflict (user_id, name),
--     which names a constraint that does not exist. PostgREST answers 42P10, so
--     Save silently no-ops for exactly the accounts that path exists to rescue.
--
-- `lists` predates this repo's migration history (created against the live
-- database directly), which is how the constraint went missing while every
-- caller assumed it.
--
-- Checked against production before writing: 9 rows, one distinct name, and no
-- (user_id, name) appears twice — so the constraint builds without conflict.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lists_user_id_name_key'
  ) then
    alter table public.lists
      add constraint lists_user_id_name_key unique (user_id, name);
  end if;
end $$;
