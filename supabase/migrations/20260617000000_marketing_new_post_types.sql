-- New marketing post types for the expanded schedule:
--   watch_tonight — Wednesday "what to watch tonight" (streaming pick)
--   hidden_gem    — Saturday "hidden gem" (1980+ modern great on streaming)
--   conversation  — text-only question for Threads/X (no image)
-- The first two ship now; conversation is added to the constraint ahead of its
-- pipeline support so the planner can schedule it without a follow-up migration.

ALTER TABLE public.marketing_posts
  DROP CONSTRAINT IF EXISTS marketing_posts_post_type_check;

ALTER TABLE public.marketing_posts
  ADD CONSTRAINT marketing_posts_post_type_check CHECK (post_type IN
    ('weekly_slate','countdown','now_streaming','trending_chart','trailer_drop',
     'on_this_day','watch_tonight','hidden_gem','conversation'));
