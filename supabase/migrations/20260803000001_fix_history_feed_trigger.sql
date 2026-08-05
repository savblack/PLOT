-- Repair feed_post_from_history(): every write to `history` has been failing.
--
-- WHAT BROKE
-- 20260718120000_feed_post_types.sql widened feed_posts' unique key from
-- (author_id, tmdb_id, media_type) to (author_id, source_type, tmdb_id,
-- media_type) — a title can be both watched and favourited — and updated each
-- trigger's ON CONFLICT target to match, dropping the old 3-column constraint.
--
-- 20260725000001_preserve_repeat_watches.sql then did `create or replace
-- function feed_post_from_journal()` to fix the DELETE branch for rewatches,
-- but pasted the pre-0718 body, silently reverting the conflict target to the
-- 3-column key. No constraint matches that any more, so the trigger raises
--   42P10: there is no unique or exclusion constraint matching the ON CONFLICT
-- and, being an AFTER trigger in the same transaction, aborts the statement
-- that fired it. Marking a title watched, editing a rating, editing a review —
-- all have failed since 2026-07-25. The newest history row in production is
-- 2026-07-19, which matches.
--
-- The function also still referenced public.journal in its DELETE branch.
-- 20260726010000 renamed that table to history and only renamed the function,
-- not its body, so deletes would have failed too once the insert path was
-- fixed. Both are corrected here.
--
-- Only feed_post_from_history was affected; feed_post_from_favourite and
-- feed_post_from_top_list still carry the correct 4-column target.

create or replace function public.feed_post_from_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    -- A title can have several history rows (one per watch date). Only retire
    -- the feed post once the last of them is gone — removing a single rewatch
    -- must not delete the post. Intent preserved from 20260725000001; the
    -- table reference is corrected from public.journal to public.history.
    if not exists (
      select 1 from public.history
      where user_id = old.user_id and tmdb_id = old.tmdb_id and media_type = old.media_type
    ) then
      delete from public.feed_posts
        where author_id = old.user_id and source_type = 'watch'
          and tmdb_id = old.tmdb_id and media_type = old.media_type;
    end if;
    return old;
  end if;

  insert into public.feed_posts (author_id, source_type, tmdb_id, media_type, title, poster_path, rating, note)
    values (new.user_id, 'watch', new.tmdb_id, new.media_type, new.title, new.poster_path, new.rating, new.note)
  -- Must match feed_posts_author_type_title_key exactly.
  on conflict (author_id, source_type, tmdb_id, media_type) do update
    set title       = excluded.title,
        poster_path = excluded.poster_path,
        rating      = excluded.rating,
        note        = excluded.note,
        updated_at  = now();
  return new;
end;
$$;
