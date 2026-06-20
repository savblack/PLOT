-- Rename two marketing post types to shorter, clearer names:
--   weekly_slate   -> upcoming   ("Upcoming this week" — Monday anchor)
--   trending_chart -> trending   ("Trending top 10"   — Friday anchor)
-- topic_key prefixes are left as-is (internal dedup keys, never surfaced).
-- Idempotent: DROP IF EXISTS + the UPDATEs are no-ops once applied, so this is
-- safe to re-run (e.g. via `supabase db push` after it was applied out-of-band).

ALTER TABLE public.marketing_posts
  DROP CONSTRAINT IF EXISTS marketing_posts_post_type_check;

UPDATE public.marketing_posts SET post_type = 'upcoming' WHERE post_type = 'weekly_slate';
UPDATE public.marketing_posts SET post_type = 'trending' WHERE post_type = 'trending_chart';

ALTER TABLE public.marketing_posts
  ADD CONSTRAINT marketing_posts_post_type_check CHECK (post_type IN
    ('upcoming','countdown','now_streaming','trending','trailer_drop',
     'on_this_day','watch_tonight','hidden_gem','conversation'));
