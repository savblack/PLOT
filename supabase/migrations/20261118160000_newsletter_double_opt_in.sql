-- Double opt-in for the weekly digest. Found in the 2026-11-18 security audit:
-- newsletter-subscribe made any address `active` and added it to the Brevo
-- marketing list on a single unauthenticated POST, so a third party could sign
-- someone up for marketing mail.
--
-- Expand only. A website signup is now written as 'pending' with a confirm
-- token and becomes 'active' only when the owner opens the emailed link
-- (supabase/functions/_shared/newsletterConfirm.ts). Nothing that sends or
-- counts mail changes: marketing_recipient_list(), send-digest.mjs,
-- brevo-sync.mjs, notify-signup and marketing/metrics/report.mjs all select
-- status = 'active', so a pending row is never mailed or counted.
-- sync_profile_marketing_flag maps any non-active status to
-- marketing_emails = false, which is already the value for a pending address.

alter table public.marketing_subscribers
  drop constraint if exists marketing_subscribers_status_check;
alter table public.marketing_subscribers
  add constraint marketing_subscribers_status_check
  check (status in ('active', 'unsubscribed', 'bounced', 'pending'));

alter table public.marketing_subscribers
  add column if not exists confirm_token text,
  add column if not exists confirm_sent_at timestamptz;

create unique index if not exists marketing_subscribers_confirm_token_key
  on public.marketing_subscribers (confirm_token)
  where confirm_token is not null;
