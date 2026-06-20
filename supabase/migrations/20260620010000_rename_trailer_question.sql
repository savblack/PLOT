-- Rename two more marketing post types to shorter names:
--   trailer_drop -> trailer
--   conversation -> question
-- topic_key prefixes are left as-is (internal dedup keys, never surfaced).
-- Idempotent: safe to re-run.

ALTER TABLE public.marketing_posts
  DROP CONSTRAINT IF EXISTS marketing_posts_post_type_check;

UPDATE public.marketing_posts SET post_type = 'trailer'  WHERE post_type = 'trailer_drop';
UPDATE public.marketing_posts SET post_type = 'question' WHERE post_type = 'conversation';

ALTER TABLE public.marketing_posts
  ADD CONSTRAINT marketing_posts_post_type_check CHECK (post_type IN
    ('upcoming','countdown','now_streaming','trending','trailer',
     'on_this_day','watch_tonight','hidden_gem','question'));
