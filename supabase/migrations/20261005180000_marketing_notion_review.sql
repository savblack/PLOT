-- Notion review surface for What's On articles.
--
-- Linear keeps working. These columns sit beside linear_issue_id and do not
-- replace it. The sweep that fills them no-ops until NOTION_TOKEN and
-- NOTION_MARKETING_DATABASE_ID are set, so scheduling the cron here does not
-- write pages or change a post.
--
-- notion_observed_status / notion_observed_date are the baseline the sweep
-- compares against. A Status or date edit counts only when the page differs
-- from those. That is the polling equivalent of Linear's updatedFrom.stateId,
-- which is what stopped the mirror's own write from being read back as a
-- decision.
--
-- notion_handled_comment_ids remembers comments already applied, including
-- the sweep's own replies, so a tick cannot run /approve twice.

alter table public.marketing_posts
  add column if not exists notion_page_id text,
  add column if not exists notion_page_url text,
  add column if not exists notion_synced_at timestamptz,
  add column if not exists notion_remote_edited_at timestamptz,
  add column if not exists notion_observed_status text,
  add column if not exists notion_observed_date text,
  add column if not exists notion_body_hash text,
  add column if not exists notion_handled_comment_ids jsonb not null default '[]'::jsonb,
  add column if not exists notion_sync_error text;

create unique index if not exists marketing_posts_notion_page_id_idx
  on public.marketing_posts (notion_page_id)
  where notion_page_id is not null;

comment on column public.marketing_posts.notion_page_id is
  'Notion page id for the What''s On review database. Null until the mirror creates one.';

alter table public.marketing_review_events
  drop constraint if exists marketing_review_events_actor_check;

alter table public.marketing_review_events
  add constraint marketing_review_events_actor_check
  check (actor in ('web_desk', 'marketing_week_skill', 'linear', 'notion'));

alter table public.marketing_batch_runs
  drop constraint if exists marketing_batch_runs_run_type_check;

alter table public.marketing_batch_runs
  add constraint marketing_batch_runs_run_type_check
  check (run_type in ('generate', 'publish', 'schedule', 'reconcile', 'linear_mirror', 'notion_mirror'));

-- One Notion sweep at a time. The webhook and the cron share it, so a delivery
-- cannot apply a comment the sweep is already applying.
create table if not exists public.marketing_notion_mirror_lease (
  singleton boolean primary key default true check (singleton),
  owner uuid not null,
  lease_until timestamptz not null
);

alter table public.marketing_notion_mirror_lease enable row level security;

create or replace function public.claim_marketing_notion_mirror(p_owner uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  if p_owner is null then
    raise exception 'Mirror lease owner is required' using errcode = '22023';
  end if;
  insert into public.marketing_notion_mirror_lease (singleton, owner, lease_until)
  values (true, p_owner, now() + interval '10 minutes')
  on conflict (singleton) do update
    set owner = excluded.owner, lease_until = excluded.lease_until
    where marketing_notion_mirror_lease.lease_until < now()
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.release_marketing_notion_mirror(p_owner uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.marketing_notion_mirror_lease where owner = p_owner
$$;

revoke all on function public.claim_marketing_notion_mirror(uuid) from public, anon, authenticated;
revoke all on function public.release_marketing_notion_mirror(uuid) from public, anon, authenticated;
grant execute on function public.claim_marketing_notion_mirror(uuid) to service_role;
grant execute on function public.release_marketing_notion_mirror(uuid) to service_role;

comment on function public.release_marketing_notion_mirror(uuid) is
  'Releases the Notion mirror lease held by p_owner.';

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Same vault secrets the Linear cron already uses. No new credential in the
-- schema. The function answers 200 and does nothing until Notion is configured.
create or replace function public.run_marketing_notion_mirror() returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  bearer   text;
  base_url text;
begin
  select decrypted_secret into bearer
    from vault.decrypted_secrets where name = 'edge_webhook_bearer';
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'edge_webhook_base_url';

  if bearer is null or base_url is null then
    raise warning 'run_marketing_notion_mirror: vault secrets missing; skipping this tick';
    return;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/marketing-notion-mirror',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$fn$;

comment on function public.run_marketing_notion_mirror() is
  'Calls marketing-notion-mirror. Bearer and base URL come from Vault.';

do $guard$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'edge_webhook_bearer') then
    raise exception 'Vault secret edge_webhook_bearer is missing — see 20260814120000_webhook_bearer_to_vault.sql';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'edge_webhook_base_url') then
    raise exception 'Vault secret edge_webhook_base_url is missing — see 20260814120000_webhook_bearer_to_vault.sql';
  end if;
end
$guard$;

select cron.unschedule('marketing-notion-mirror')
  where exists (select 1 from cron.job where jobname = 'marketing-notion-mirror');

select cron.schedule(
  'marketing-notion-mirror',
  '*/5 * * * *',
  $cron$select public.run_marketing_notion_mirror()$cron$
);
