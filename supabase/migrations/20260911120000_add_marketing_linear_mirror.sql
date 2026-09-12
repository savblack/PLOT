-- Mirror of each marketing post as a Linear issue (team PLO, project "Content
-- Automation"), so the week can be reviewed, edited and approved from Linear
-- instead of the admin desk at admin.theplot.tv.
--
-- The database stays the source of truth: publish.mjs still gates on
-- status='approved' and the publication rows, exactly as before. These columns
-- only record which issue mirrors which post, so the weekly batch is idempotent
-- (a re-run updates the issue it already made instead of opening a second one)
-- and the webhook can resolve an incoming comment back to its post.
--
-- Shaped to match the feedback mirror's columns (20260612183000) so both
-- integrations look the same when you go reading.
alter table public.marketing_posts
  add column if not exists linear_issue_id text,
  add column if not exists linear_issue_url text,
  add column if not exists linear_synced_at timestamptz,
  add column if not exists linear_sync_error text;

-- The webhook's only lookup: issue id -> post. Partial, because the column is
-- null for every post generated before this existed and for guides that never
-- reached Linear.
create unique index if not exists marketing_posts_linear_issue_id_idx
  on public.marketing_posts (linear_issue_id)
  where linear_issue_id is not null;
