-- Drop the social-feed engagement layer.
--
-- PLOT is not shipping a Twitter-shaped feed. Profiles are the social surface
-- (see the 2026-08-13 decision and issue #499). The engagement layer built on
-- top of feed_posts goes; the substrate stays.
--
-- SAFE TO DROP: post_likes, post_comments and comment_likes were each verified
-- at **0 rows on production** immediately before this was written. No user data
-- is destroyed. This is the safest moment it will ever be, which is why it is a
-- deletion rather than another dormant flag.
--
-- KEPT, deliberately:
--   * feed_posts (38 rows) and its three triggers — feed_post_from_history,
--     feed_post_from_favourite, feed_post_from_top_list. That is a Goodreads-style
--     activity substrate and it keeps recording, unsurfaced, so an activity
--     stream stays possible later without starting from an empty history.
--   * follows, notifications, and public profiles.
--   * list_notifications() — checked against the LIVE definition via
--     pg_get_functiondef, not against the migration that last touched it. It
--     joins notifications, profiles and feed_posts only, so nothing here reaches
--     it and it is deliberately NOT redefined. Recreating it from a remembered
--     body is the exact mistake that cost two weeks of failed history writes in
--     July.
--
-- Notification rows: production holds new_follower, follow_request and
-- follow_accepted only. There are no like/comment notifications to orphan.

set search_path to public, extensions;

-- Triggers first, so the notify_* functions have no dependents. (Dropping the
-- tables would take these too; being explicit documents what existed.)
drop trigger if exists trg_notify_post_like    on public.post_likes;
drop trigger if exists trg_notify_post_comment on public.post_comments;
drop trigger if exists trg_notify_comment_like on public.comment_likes;

drop function if exists public.notify_post_like();
drop function if exists public.notify_post_comment();
drop function if exists public.notify_comment_like();

-- Feed readers. Both select from post_likes/post_comments for like and comment
-- counts, so they cannot outlive the tables. Their only caller was useFeed,
-- deleted in this change.
-- Signatures taken from pg_get_function_identity_arguments against production,
-- not guessed: `drop function if exists` with a wrong signature is a silent
-- no-op and would leave these behind.
drop function if exists public.get_feed(timestamp with time zone, integer);
drop function if exists public.get_global_feed(timestamp with time zone, integer);
drop function if exists public.list_post_comments(uuid);

-- comment_likes before post_comments: comment_likes_comment_id_fkey points at it.
drop table if exists public.comment_likes;
drop table if exists public.post_comments;
drop table if exists public.post_likes;
