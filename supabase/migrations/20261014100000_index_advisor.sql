-- Performance advisor info: index the foreign keys it named, and drop
-- indexes nothing has scanned since the database started on 2026-09-27.
--
-- Seven unused indexes stay. Each one is the only index that begins with
-- a foreign key, so dropping it would raise the unindexed-foreign-key
-- info instead:
--   follows_following_id_idx
--   integration_items_user_tmdb_idx
--   integration_outbox_integration_status_idx
--   operator_approvals_post_created_idx
--   operator_notes_post_created_idx
--   operator_attempts_post_created_idx
--   push_tokens_user_idx
--
-- A new index starts with zero scans, so the advisor can list these
-- foreign-key indexes as unused until a query uses them.

create index if not exists feedback_user_id_idx
  on public.feedback (user_id);
create index if not exists imported_lists_list_id_idx
  on public.imported_lists (list_id);
create index if not exists list_items_user_id_idx
  on public.list_items (user_id);
create index if not exists notifications_actor_id_idx
  on public.notifications (actor_id);
create index if not exists notifications_post_id_idx
  on public.notifications (post_id);
create index if not exists operator_sync_links_legacy_post_id_idx
  on public.operator_sync_links (legacy_post_id);
create index if not exists push_deliveries_token_idx
  on public.push_deliveries (token);
create index if not exists reports_reporter_id_idx
  on public.reports (reporter_id);
create index if not exists tracking_review_items_integration_id_idx
  on public.tracking_review_items (integration_id);
create index if not exists user_custom_list_invites_created_by_idx
  on public.user_custom_list_invites (created_by);
create index if not exists user_custom_list_items_added_by_idx
  on public.user_custom_list_items (added_by);
create index if not exists user_custom_list_items_list_id_user_id_idx
  on public.user_custom_list_items (list_id, user_id);
create index if not exists user_custom_list_items_user_id_idx
  on public.user_custom_list_items (user_id);
create index if not exists user_custom_list_members_added_by_idx
  on public.user_custom_list_members (added_by);
create index if not exists user_custom_lists_user_id_idx
  on public.user_custom_lists (user_id);
create index if not exists watch_together_closed_recipient_id_idx
  on public.watch_together_closed (recipient_id);
create index if not exists watch_together_votes_user_id_idx
  on public.watch_together_votes (user_id);

drop index if exists public.alert_job_runs_job_idx;
drop index if exists public.availability_events_recent_idx;
drop index if exists public.feed_posts_created_idx;
drop index if exists public.follows_accepted_lookup_idx;
drop index if exists public.kofi_supporters_email_idx;
drop index if exists public.kofi_supporters_unmatched_idx;
drop index if exists public.marketing_batch_runs_type_started_idx;
drop index if exists public.notification_deliveries_open_idx;
drop index if exists public.operator_posts_state_sched_idx;
drop index if exists public.operator_variants_status_sched_idx;
drop index if exists public.people_feed_release_idx;
drop index if exists public.person_alerts_person_idx;
drop index if exists public.reports_status_idx;
drop index if exists public.reports_unmirrored_idx;
drop index if exists public.season_ready_alerts_show_idx;
drop index if exists public.tracking_jobs_due;
drop index if exists public.tracking_jobs_worker_due;
drop index if exists public.user_custom_lists_is_public_idx;
drop index if exists public.user_custom_lists_visibility_public_idx;

do $guard$
declare
  missing text;
  still_there text;
begin
  select string_agg(name, ', ' order by name)
    into missing
  from unnest(array[
    'feedback_user_id_idx',
    'imported_lists_list_id_idx',
    'list_items_user_id_idx',
    'notifications_actor_id_idx',
    'notifications_post_id_idx',
    'operator_sync_links_legacy_post_id_idx',
    'push_deliveries_token_idx',
    'reports_reporter_id_idx',
    'tracking_review_items_integration_id_idx',
    'user_custom_list_invites_created_by_idx',
    'user_custom_list_items_added_by_idx',
    'user_custom_list_items_list_id_user_id_idx',
    'user_custom_list_items_user_id_idx',
    'user_custom_list_members_added_by_idx',
    'user_custom_lists_user_id_idx',
    'watch_together_closed_recipient_id_idx',
    'watch_together_votes_user_id_idx'
  ]) as name
  where to_regclass('public.' || name) is null;
  if missing is not null then
    raise exception 'foreign key index missing: %', missing;
  end if;

  select string_agg(name, ', ' order by name)
    into still_there
  from unnest(array[
    'alert_job_runs_job_idx',
    'availability_events_recent_idx',
    'feed_posts_created_idx',
    'follows_accepted_lookup_idx',
    'kofi_supporters_email_idx',
    'kofi_supporters_unmatched_idx',
    'marketing_batch_runs_type_started_idx',
    'notification_deliveries_open_idx',
    'operator_posts_state_sched_idx',
    'operator_variants_status_sched_idx',
    'people_feed_release_idx',
    'person_alerts_person_idx',
    'reports_status_idx',
    'reports_unmirrored_idx',
    'season_ready_alerts_show_idx',
    'tracking_jobs_due',
    'tracking_jobs_worker_due',
    'user_custom_lists_is_public_idx',
    'user_custom_lists_visibility_public_idx'
  ]) as name
  where to_regclass('public.' || name) is not null;
  if still_there is not null then
    raise exception 'unused index still present: %', still_there;
  end if;
end
$guard$;
