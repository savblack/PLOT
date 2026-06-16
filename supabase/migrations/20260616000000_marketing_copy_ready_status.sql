-- Add the 'copy_ready' status to marketing_posts.
--
-- The copy step now runs as a separate, API-key-free AI worker (Claude Code /
-- Codex; see marketing/copy/). The lifecycle gains one state between planning
-- and rendering:
--   planned -> copy_ready -> generated -> pending_review -> published
-- 'planned'    : post created by the planner, awaiting copy.
-- 'copy_ready' : copy written and validated, awaiting render + veto digest.

ALTER TABLE public.marketing_posts
  DROP CONSTRAINT IF EXISTS marketing_posts_status_check;

ALTER TABLE public.marketing_posts
  ADD CONSTRAINT marketing_posts_status_check CHECK (status IN
    ('planned','copy_ready','generated','pending_review','published',
     'partially_published','vetoed','failed','skipped'));
