alter table public.feedback
  add column if not exists linear_issue_id text,
  add column if not exists linear_issue_url text,
  add column if not exists linear_synced_at timestamptz,
  add column if not exists linear_sync_error text;
