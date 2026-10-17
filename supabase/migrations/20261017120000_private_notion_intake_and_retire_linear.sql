-- Store private Notion intake links while preserving historical issue links.
-- The owner must create and share both private databases before deploying the
-- notification functions. This migration does not send data to Notion.
alter table public.feedback
  add column if not exists notion_page_id text,
  add column if not exists notion_page_url text,
  add column if not exists notion_synced_at timestamptz,
  add column if not exists notion_sync_error text;

alter table public.reports
  add column if not exists notion_page_id text,
  add column if not exists notion_page_url text,
  add column if not exists notion_synced_at timestamptz,
  add column if not exists notion_sync_error text;

create unique index if not exists feedback_notion_page_id_idx
  on public.feedback (notion_page_id) where notion_page_id is not null;
create unique index if not exists reports_notion_page_id_idx
  on public.reports (notion_page_id) where notion_page_id is not null;

create index if not exists feedback_notion_retry_idx on public.feedback (created_at)
  where notion_page_id is null and linear_issue_id is null and github_issue_number is null;
create index if not exists reports_notion_retry_idx on public.reports (created_at)
  where notion_page_id is null and linear_issue_id is null;

-- Retire the old five-minute mirror without touching its historical rows.
select cron.unschedule('marketing-linear-mirror')
  where exists (select 1 from cron.job where jobname = 'marketing-linear-mirror');
drop function if exists public.run_marketing_linear_mirror();
drop function if exists public.claim_marketing_linear_mirror(uuid);
drop function if exists public.release_marketing_linear_mirror(uuid);
drop table if exists public.marketing_linear_mirror_lease;
