-- Drop the dead rewatch guard in feed_post_from_history()'s DELETE branch.
--
-- The guard asked whether any other history row for this title survived before
-- retiring the feed post, so that removing one rewatch of a title watched three
-- times left the post standing. 20260806000001 removed rewatch logging: history
-- now holds one row per (user_id, tmdb_id, media_type). The trigger is
-- AFTER DELETE FOR EACH ROW, so by the time it runs that single row is already
-- gone and the `not exists` is true every time. Dead, not wrong — it has been
-- deleting the post unconditionally since that migration, just via a subquery.
--
-- WHY THIS FILE IS SO CAREFUL
-- `create or replace function` on this exact function caused the 2026-07-25 →
-- 08-03 outage, when 20260725000001 pasted a body predating 20260718120000 and
-- silently reverted the ON CONFLICT target to a key that had been dropped. The
-- trigger then raised 42P10 on every write to history and, being AFTER in the
-- same transaction, took the triggering statement with it. Marking a title
-- watched failed for two weeks.
--
-- So the body below is not written from a previous migration. It is the live
-- definition read back out of production with pg_get_functiondef(), with the
-- four lines of the guard removed and nothing else touched. In particular the
-- INSERT branch is byte-for-byte what is running now, ON CONFLICT target
-- included. npm run migrations:check compares the target across redefinitions
-- and fails if it moves.

create or replace function public.feed_post_from_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    -- One history row per title, and this fires after it is gone, so nothing is
    -- left behind the post.
    delete from public.feed_posts
      where author_id = old.user_id and source_type = 'watch'
        and tmdb_id = old.tmdb_id and media_type = old.media_type;
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
