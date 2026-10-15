-- Low findings from the 2026-10-13 security review that live in the database.
-- Each block is independent and idempotent.

-- ── 1. profiles: make the writable column set explicit ───────────────────────
-- "users can update own profile" scoped the row but not the columns, so every
-- column a client could name was writable except the three the
-- protect_premium_flag trigger guards. Entitlement is derived from
-- billing_customers so nothing was bypassable, but the writable set was only
-- implicit. Column-level privileges make it a grant, so adding a sensitive
-- column later is safe by default: it is read-only until someone lists it here.
-- id, is_premium, is_supporter and last_kofi_tip_at are deliberately absent.
revoke update on public.profiles from anon, authenticated;
grant update (
  avatar_url, bio, calendar_token, digest_prompt_dismissed_at, display_name,
  first_name, genres, guide_channels, include_kids_content, is_public, links,
  marketing_emails, onboarding_complete, profile_sections, region,
  streaming_providers, timezone, username, watch_together_requests_from,
  watchlist_availability_alerts, watchlist_visibility
) on public.profiles to authenticated;

-- ── 2. username_available: signed-in callers only ───────────────────────────
-- Every caller (web Settings, the public-profile editor, the mobile edit
-- modal) is signed in. Open to anon it was an unauthenticated oracle for
-- which handles exist.
revoke execute on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;

-- ── 3. feedback-attachments: per-user upload budget ─────────────────────────
-- The bucket is public and the insert policy only checked the path shape, so
-- any signed-in user had an unlimited 5 MB-per-object image host. A feedback
-- report carries one or two screenshots; twenty a day is generous.
--
-- Counted through a definer helper because storage.objects' select policies
-- would otherwise hide the caller's own rows from the count and let it pass.
create or replace function private.feedback_upload_within_budget()
returns boolean
language sql
security definer
stable
set search_path = storage, pg_temp
as $$
  select count(*) < 20
    from storage.objects
   where bucket_id = 'feedback-attachments'
     and owner_id = (select auth.uid())::text
     and created_at > now() - interval '1 day'
$$;
revoke all on function private.feedback_upload_within_budget() from public;
grant execute on function private.feedback_upload_within_budget() to authenticated;

drop policy if exists "Users can upload feedback attachments" on storage.objects;
create policy "Users can upload feedback attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'feedback-attachments'
    and name ~ '^feedback/[0-9a-fA-F-]{36}(\.[a-zA-Z0-9]{1,10})?$'
    and private.feedback_upload_within_budget()
  );

-- ── 4. A read-only role for the CI write-paths check ────────────────────────
-- .github/workflows/db-write-paths.yml runs on pull_request with a production
-- connection string, so a collaborator's PR can edit the script that uses it.
-- The check only reads catalogs, so give it a role that can do nothing else.
-- No password here (this file is public to the repo): set one by hand and put
-- the URL in the SUPABASE_DB_URL_READONLY secret, per docs/ops/db-restore.md.
--   alter role plot_ci_readonly with login password '<generated>';
do $role$
begin
  if not exists (select 1 from pg_roles where rolname = 'plot_ci_readonly') then
    create role plot_ci_readonly nologin;
  end if;
end
$role$;
grant usage on schema public to plot_ci_readonly;
grant usage on schema supabase_migrations to plot_ci_readonly;
grant select on supabase_migrations.schema_migrations to plot_ci_readonly;
-- Catalog reads (pg_trigger, pg_constraint, pg_index, pg_proc) need no grant.
