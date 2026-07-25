-- SUS-66: preserve repeat watches instead of collapsing them.
--
-- journal previously enforced unique (user_id, tmdb_id), so logging a title as
-- watched a second time overwrote the first watch's date/rating/note instead
-- of recording a separate rewatch. Relax the constraint to
-- (user_id, tmdb_id, watched_at): the same date still upserts in place
-- (protects against duplicate taps / re-imports of the same source row), but a
-- genuinely different watched_at now inserts a new row, preserving the
-- rewatch. Every write path already upserts by watched_at going forward
-- (packages/core/userMedia.js), so this is purely additive — no existing rows
-- are touched or lost.
alter table journal
  drop constraint if exists journal_user_id_tmdb_id_key;

alter table journal
  add constraint journal_user_id_tmdb_id_watched_at_key
  unique (user_id, tmdb_id, watched_at);

-- New user preference: log every rewatch as its own history entry (default),
-- or keep the old single-entry-per-title behavior for users who don't want a
-- cluttered history. Read by packages/core/userMedia.js logWatchedItem.
alter table profiles
  add column if not exists log_rewatches boolean not null default true;

-- feed_posts stays keyed on (author_id, tmdb_id, media_type) — one feed post
-- per title, regardless of how many times it's been watched; a rewatch just
-- updates that post's rating/note in place rather than spamming the feed.
-- But its DELETE trigger unconditionally deleted the post whenever ANY
-- journal row for that title was removed — now that a title can have
-- multiple journal rows, deleting one (e.g. removing a single rewatch entry)
-- must not delete the feed post if other watches of that title remain.
create or replace function public.feed_post_from_journal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if not exists (
      select 1 from public.journal
      where user_id = old.user_id and tmdb_id = old.tmdb_id and media_type = old.media_type
    ) then
      delete from public.feed_posts
        where author_id = old.user_id and tmdb_id = old.tmdb_id and media_type = old.media_type;
    end if;
    return old;
  end if;

  insert into public.feed_posts (author_id, source_type, tmdb_id, media_type, title, poster_path, rating, note)
    values (new.user_id, 'watch', new.tmdb_id, new.media_type, new.title, new.poster_path, new.rating, new.note)
  on conflict (author_id, tmdb_id, media_type) do update
    set title       = excluded.title,
        poster_path = excluded.poster_path,
        rating      = excluded.rating,
        note        = excluded.note,
        updated_at  = now();
  return new;
end;
$$;
