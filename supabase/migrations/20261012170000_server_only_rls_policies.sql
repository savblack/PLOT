-- These tables already have row level security and no policy, so anon and
-- authenticated receive no rows. A select policy of false is that same
-- lockdown written down, which clears the rls_enabled_no_policy advisor lint.
-- Same shape as "title_similarity is server-only" in 20260726020000.
--
-- service_role bypasses row level security and these tables are not forced,
-- so edge functions and security-definer functions keep their current access.
-- The signed-in data export reads watch_together_sessions,
-- watch_together_votes, and watch_together_links and already stores empty
-- arrays. This policy keeps those arrays empty.

alter table public.alert_job_runs enable row level security;
drop policy if exists "alert_job_runs is server-only" on public.alert_job_runs;
create policy "alert_job_runs is server-only"
  on public.alert_job_runs for select using (false);

alter table public.app_waitlist enable row level security;
drop policy if exists "app_waitlist is server-only" on public.app_waitlist;
create policy "app_waitlist is server-only"
  on public.app_waitlist for select using (false);

alter table public.auth_fail_attempts enable row level security;
drop policy if exists "auth_fail_attempts is server-only" on public.auth_fail_attempts;
create policy "auth_fail_attempts is server-only"
  on public.auth_fail_attempts for select using (false);

alter table public.availability_events enable row level security;
drop policy if exists "availability_events is server-only" on public.availability_events;
create policy "availability_events is server-only"
  on public.availability_events for select using (false);

alter table public.billing_checkout_attempts enable row level security;
drop policy if exists "billing_checkout_attempts is server-only" on public.billing_checkout_attempts;
create policy "billing_checkout_attempts is server-only"
  on public.billing_checkout_attempts for select using (false);

alter table public.billing_customers enable row level security;
drop policy if exists "billing_customers is server-only" on public.billing_customers;
create policy "billing_customers is server-only"
  on public.billing_customers for select using (false);

alter table public.critic_score_request_quota enable row level security;
drop policy if exists "critic_score_request_quota is server-only" on public.critic_score_request_quota;
create policy "critic_score_request_quota is server-only"
  on public.critic_score_request_quota for select using (false);

alter table public.kofi_supporters enable row level security;
drop policy if exists "kofi_supporters is server-only" on public.kofi_supporters;
create policy "kofi_supporters is server-only"
  on public.kofi_supporters for select using (false);

alter table public.marketing_batch_runs enable row level security;
drop policy if exists "marketing_batch_runs is server-only" on public.marketing_batch_runs;
create policy "marketing_batch_runs is server-only"
  on public.marketing_batch_runs for select using (false);

alter table public.marketing_linear_mirror_lease enable row level security;
drop policy if exists "marketing_linear_mirror_lease is server-only" on public.marketing_linear_mirror_lease;
create policy "marketing_linear_mirror_lease is server-only"
  on public.marketing_linear_mirror_lease for select using (false);

alter table public.marketing_metrics enable row level security;
drop policy if exists "marketing_metrics is server-only" on public.marketing_metrics;
create policy "marketing_metrics is server-only"
  on public.marketing_metrics for select using (false);

alter table public.marketing_newsletter_issues enable row level security;
drop policy if exists "marketing_newsletter_issues is server-only" on public.marketing_newsletter_issues;
create policy "marketing_newsletter_issues is server-only"
  on public.marketing_newsletter_issues for select using (false);

alter table public.marketing_notion_mirror_lease enable row level security;
drop policy if exists "marketing_notion_mirror_lease is server-only" on public.marketing_notion_mirror_lease;
create policy "marketing_notion_mirror_lease is server-only"
  on public.marketing_notion_mirror_lease for select using (false);

alter table public.marketing_post_publications enable row level security;
drop policy if exists "marketing_post_publications is server-only" on public.marketing_post_publications;
create policy "marketing_post_publications is server-only"
  on public.marketing_post_publications for select using (false);

alter table public.marketing_posts enable row level security;
drop policy if exists "marketing_posts is server-only" on public.marketing_posts;
create policy "marketing_posts is server-only"
  on public.marketing_posts for select using (false);

alter table public.marketing_review_events enable row level security;
drop policy if exists "marketing_review_events is server-only" on public.marketing_review_events;
create policy "marketing_review_events is server-only"
  on public.marketing_review_events for select using (false);

alter table public.marketing_settings enable row level security;
drop policy if exists "marketing_settings is server-only" on public.marketing_settings;
create policy "marketing_settings is server-only"
  on public.marketing_settings for select using (false);

alter table public.marketing_subscribers enable row level security;
drop policy if exists "marketing_subscribers is server-only" on public.marketing_subscribers;
create policy "marketing_subscribers is server-only"
  on public.marketing_subscribers for select using (false);

alter table public.marketing_tokens enable row level security;
drop policy if exists "marketing_tokens is server-only" on public.marketing_tokens;
create policy "marketing_tokens is server-only"
  on public.marketing_tokens for select using (false);

alter table public.marketing_tracked_titles enable row level security;
drop policy if exists "marketing_tracked_titles is server-only" on public.marketing_tracked_titles;
create policy "marketing_tracked_titles is server-only"
  on public.marketing_tracked_titles for select using (false);

alter table public.marketing_trending_snapshots enable row level security;
drop policy if exists "marketing_trending_snapshots is server-only" on public.marketing_trending_snapshots;
create policy "marketing_trending_snapshots is server-only"
  on public.marketing_trending_snapshots for select using (false);

alter table public.notification_deliveries enable row level security;
drop policy if exists "notification_deliveries is server-only" on public.notification_deliveries;
create policy "notification_deliveries is server-only"
  on public.notification_deliveries for select using (false);

alter table public.operator_approval_decisions enable row level security;
drop policy if exists "operator_approval_decisions is server-only" on public.operator_approval_decisions;
create policy "operator_approval_decisions is server-only"
  on public.operator_approval_decisions for select using (false);

alter table public.operator_channel_accounts enable row level security;
drop policy if exists "operator_channel_accounts is server-only" on public.operator_channel_accounts;
create policy "operator_channel_accounts is server-only"
  on public.operator_channel_accounts for select using (false);

alter table public.operator_post_channel_variants enable row level security;
drop policy if exists "operator_post_channel_variants is server-only" on public.operator_post_channel_variants;
create policy "operator_post_channel_variants is server-only"
  on public.operator_post_channel_variants for select using (false);

alter table public.operator_post_media enable row level security;
drop policy if exists "operator_post_media is server-only" on public.operator_post_media;
create policy "operator_post_media is server-only"
  on public.operator_post_media for select using (false);

alter table public.operator_post_notes enable row level security;
drop policy if exists "operator_post_notes is server-only" on public.operator_post_notes;
create policy "operator_post_notes is server-only"
  on public.operator_post_notes for select using (false);

alter table public.operator_posts enable row level security;
drop policy if exists "operator_posts is server-only" on public.operator_posts;
create policy "operator_posts is server-only"
  on public.operator_posts for select using (false);

alter table public.operator_publish_attempts enable row level security;
drop policy if exists "operator_publish_attempts is server-only" on public.operator_publish_attempts;
create policy "operator_publish_attempts is server-only"
  on public.operator_publish_attempts for select using (false);

alter table public.operator_sync_links enable row level security;
drop policy if exists "operator_sync_links is server-only" on public.operator_sync_links;
create policy "operator_sync_links is server-only"
  on public.operator_sync_links for select using (false);

alter table public.push_deliveries enable row level security;
drop policy if exists "push_deliveries is server-only" on public.push_deliveries;
create policy "push_deliveries is server-only"
  on public.push_deliveries for select using (false);

alter table public.stripe_events enable row level security;
drop policy if exists "stripe_events is server-only" on public.stripe_events;
create policy "stripe_events is server-only"
  on public.stripe_events for select using (false);

alter table public.title_availability enable row level security;
drop policy if exists "title_availability is server-only" on public.title_availability;
create policy "title_availability is server-only"
  on public.title_availability for select using (false);

alter table public.user_custom_list_invites enable row level security;
drop policy if exists "user_custom_list_invites is server-only" on public.user_custom_list_invites;
create policy "user_custom_list_invites is server-only"
  on public.user_custom_list_invites for select using (false);

alter table public.watch_together_closed enable row level security;
drop policy if exists "watch_together_closed is server-only" on public.watch_together_closed;
create policy "watch_together_closed is server-only"
  on public.watch_together_closed for select using (false);

alter table public.watch_together_links enable row level security;
drop policy if exists "watch_together_links is server-only" on public.watch_together_links;
create policy "watch_together_links is server-only"
  on public.watch_together_links for select using (false);

alter table public.watch_together_sessions enable row level security;
drop policy if exists "watch_together_sessions is server-only" on public.watch_together_sessions;
create policy "watch_together_sessions is server-only"
  on public.watch_together_sessions for select using (false);

alter table public.watch_together_votes enable row level security;
drop policy if exists "watch_together_votes is server-only" on public.watch_together_votes;
create policy "watch_together_votes is server-only"
  on public.watch_together_votes for select using (false);

-- Fail the migration if any of the 38 is still missing its deny policy.
do $$
declare
  missing text;
begin
  select string_agg(t, ', ' order by t)
    into missing
  from unnest(array[
    'alert_job_runs',
    'app_waitlist',
    'auth_fail_attempts',
    'availability_events',
    'billing_checkout_attempts',
    'billing_customers',
    'critic_score_request_quota',
    'kofi_supporters',
    'marketing_batch_runs',
    'marketing_linear_mirror_lease',
    'marketing_metrics',
    'marketing_newsletter_issues',
    'marketing_notion_mirror_lease',
    'marketing_post_publications',
    'marketing_posts',
    'marketing_review_events',
    'marketing_settings',
    'marketing_subscribers',
    'marketing_tokens',
    'marketing_tracked_titles',
    'marketing_trending_snapshots',
    'notification_deliveries',
    'operator_approval_decisions',
    'operator_channel_accounts',
    'operator_post_channel_variants',
    'operator_post_media',
    'operator_post_notes',
    'operator_posts',
    'operator_publish_attempts',
    'operator_sync_links',
    'push_deliveries',
    'stripe_events',
    'title_availability',
    'user_custom_list_invites',
    'watch_together_closed',
    'watch_together_links',
    'watch_together_sessions',
    'watch_together_votes'
  ]) as t
  where not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = t
      and p.polname = t || ' is server-only'
      and p.polcmd = 'r'
      and pg_get_expr(p.polqual, p.polrelid) = 'false'
  );
  if missing is not null then
    raise exception 'server-only select policy missing on %', missing;
  end if;
end $$;
