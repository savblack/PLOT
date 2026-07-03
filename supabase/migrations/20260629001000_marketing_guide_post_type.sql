-- The operator desk can originate manual article-style posts that bridge back
-- into marketing_posts as `guide`. generate.mjs already supports guide rows,
-- but the persisted constraint never allowed them.

ALTER TABLE public.marketing_posts
  DROP CONSTRAINT IF EXISTS marketing_posts_post_type_check;

ALTER TABLE public.marketing_posts
  ADD CONSTRAINT marketing_posts_post_type_check CHECK (post_type IN
    ('upcoming','countdown','now_streaming','trending','trailer',
     'on_this_day','watch_tonight','hidden_gem','question','guide'));
