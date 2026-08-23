-- Feedback intake mirrors into GitHub issues instead of Linear.
--
-- The linear_* columns are deliberately kept, not dropped or renamed: they are
-- the only record of what was already mirrored, including the rows the revoked
-- LINEAR_API_KEY stranded on 2026-08-22. notify-feedback reads them to decide
-- what still needs a GitHub issue, and to leave anything already tracked in
-- Linear alone.
alter table public.feedback
  add column if not exists github_issue_number integer,
  add column if not exists github_issue_url text,
  add column if not exists github_synced_at timestamptz,
  add column if not exists github_sync_error text;
