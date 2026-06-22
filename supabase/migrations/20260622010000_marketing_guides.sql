-- Add the 'guide' marketing post type: web-only, long-form evergreen SEO
-- articles ("Best sci-fi on Max", "Shows like Severance") published to
-- theplot.tv/whats-on. Extends the post_type CHECK (DROP + re-ADD, mirroring
-- 20260620010000_rename_trailer_question.sql). Idempotent: safe to re-run.

ALTER TABLE public.marketing_posts
  DROP CONSTRAINT IF EXISTS marketing_posts_post_type_check;

ALTER TABLE public.marketing_posts
  ADD CONSTRAINT marketing_posts_post_type_check CHECK (post_type IN
    ('upcoming','countdown','now_streaming','trending','trailer',
     'on_this_day','watch_tonight','hidden_gem','question','guide'));
