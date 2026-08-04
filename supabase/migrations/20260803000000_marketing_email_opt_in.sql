-- Marketing email opt-in for app users.
--
-- Until now the only way onto the weekly digest list was the newsletter form on
-- theplot.tv. App users were synced into Brevo as contacts but deliberately
-- never onto the marketable list (see supabase/functions/notify-signup), which
-- was correct — signing up for an app is not consent to be marketed to — but it
-- left them with no way to say yes at all.
--
-- Shape of the fix:
--   profiles.marketing_emails       the user-facing switch (Settings, prompts)
--   marketing_subscribers           still the one sending list, now able to
--                                   carry a user_id and a consent timestamp
-- Two triggers keep the pair honest in both directions, so an unsubscribe from
-- an email footer turns the Settings toggle off, and vice versa.
--
-- Additive only — the database has real users, and nobody's existing consent
-- state changes: marketing_emails defaults to false, so every current account
-- stays off the marketable list until they opt in themselves.

-- 1. The user-facing switch ---------------------------------------------------

alter table public.profiles
  -- Consent, not preference: default false, only ever set by the user's own
  -- action (Settings toggle or the in-app prompt).
  add column if not exists marketing_emails boolean not null default false,
  -- Set when someone dismisses the in-app digest prompt, so the ask happens
  -- once per account rather than once per device.
  add column if not exists digest_prompt_dismissed_at timestamptz;

-- 2. Consent record on the sending list ---------------------------------------

alter table public.marketing_subscribers
  -- Set for app opt-ins; null for website form signups, which have no account.
  -- Cascade rather than set null: delete-account already deletes the Brevo
  -- contact outright, so keeping a sendable row here would leave the digest
  -- emailing an address Brevo no longer knows about.
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  -- When consent was last given. created_at only records when the row first
  -- appeared, which stops being the same thing once resubscribing is possible.
  add column if not exists consented_at timestamptz;

-- One subscriber row per account. Partial so the many website rows with a null
-- user_id don't collide.
create unique index if not exists marketing_subscribers_user_id_key
  on public.marketing_subscribers (user_id)
  where user_id is not null;

-- Existing active subscribers consented when their row was created.
update public.marketing_subscribers
   set consented_at = created_at
 where consented_at is null
   and status = 'active';

-- Website signups that turn out to belong to an account: link them. Email is
-- unique on both sides, so this can't produce two rows for one user.
update public.marketing_subscribers s
   set user_id = u.id
  from auth.users u
 where s.user_id is null
   and lower(s.email::text) = lower(u.email);

-- ...and let the new toggle tell them the truth. Someone who subscribed on
-- theplot.tv with the address they use in the app is already receiving the
-- digest; leaving the switch reading "off" would both look wrong and leave them
-- no way to turn it off from here. Their consent is unchanged — this only makes
-- it visible and revocable. Runs before section 3, so the new sync triggers
-- don't exist yet and this writes plain rows; the pre-existing profiles webhook
-- still mirrors the flag to Brevo, which is the outcome we want anyway.
update public.profiles p
   set marketing_emails = true
  from public.marketing_subscribers s
 where s.user_id = p.id
   and s.status = 'active'
   and p.marketing_emails = false;

-- 3. profiles.marketing_emails -> marketing_subscribers -----------------------

create or replace function public.sync_marketing_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_email text;
begin
  select email into user_email from auth.users where id = new.id;
  -- No address to add or remove. Nothing to do.
  if user_email is null then return new; end if;

  if new.marketing_emails then
    -- An account can change its email address, which leaves a row here keyed to
    -- an address that is no longer theirs. Drop it first so neither unique index
    -- (email, user_id) can collide on the upsert below. Dropping it loses no
    -- consent record worth keeping: what follows is a fresh, express opt-in.
    -- lower() on both sides: email is citext (case-insensitive) but the cast to
    -- text needed to compare it with a text variable is not.
    delete from public.marketing_subscribers
     where user_id = new.id
       and lower(email::text) <> lower(user_email);

    -- Aliased so the conflicting row can be referenced unambiguously below.
    insert into public.marketing_subscribers as ms
                (email, user_id, status, source, consented_at, unsubscribed_at)
    values (user_email, new.id, 'active', 'app', now(), null)
    on conflict (email) do update
       set status         = 'active',
           user_id        = new.id,
           source         = 'app',
           consented_at   = now(),
           unsubscribed_at = null
     -- No-op when the row already says exactly this, so the paired trigger in
     -- section 4 has nothing to react to and the two can't ping-pong.
     where ms.status <> 'active'
        or ms.user_id is distinct from new.id;
  else
    update public.marketing_subscribers
       set status = 'unsubscribed',
           unsubscribed_at = now()
     where user_id = new.id
       and status <> 'unsubscribed';
  end if;

  return new;
end;
$$;

-- No revoke: both trigger functions here keep the default execute-to-public, on
-- purpose. A trigger fires without an execute-privilege check on the invoking
-- role, so revoking would risk breaking the Settings toggle for real users while
-- buying nothing — called directly, a plpgsql trigger function only ever raises
-- "trigger functions can only be called as triggers".

-- Split by operation because a WHEN clause on an INSERT trigger may not
-- reference OLD, and only the UPDATE side has a previous value to compare.
drop trigger if exists trg_sync_marketing_subscription on public.profiles;
create trigger trg_sync_marketing_subscription
  after update of marketing_emails on public.profiles
  for each row
  when (new.marketing_emails is distinct from old.marketing_emails)
  execute function public.sync_marketing_subscription();

drop trigger if exists trg_sync_marketing_subscription_insert on public.profiles;
create trigger trg_sync_marketing_subscription_insert
  after insert on public.profiles
  for each row
  when (new.marketing_emails)
  execute function public.sync_marketing_subscription();

-- 4. marketing_subscribers -> profiles.marketing_emails -----------------------
-- So unsubscribing from an email footer (or a one-click List-Unsubscribe) is
-- reflected by the Settings toggle instead of silently disagreeing with it.

create or replace function public.sync_profile_marketing_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then return new; end if;

  update public.profiles
     set marketing_emails = (new.status = 'active')
   where id = new.user_id
     -- Same no-op guard as section 3, from the other side.
     and marketing_emails is distinct from (new.status = 'active');

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_marketing_flag on public.marketing_subscribers;
create trigger trg_sync_profile_marketing_flag
  after update of status on public.marketing_subscribers
  for each row
  when (new.status is distinct from old.status)
  execute function public.sync_profile_marketing_flag();

-- 5. Recipient list with fresh addresses --------------------------------------
-- An app user can change their email in Settings, which lands in auth.users and
-- leaves marketing_subscribers.email stale. Rather than chase that with another
-- trigger, resolve the address at send time: auth.users wins for linked rows.
--
-- Service-role only. It returns email addresses and unsubscribe tokens, so the
-- default "execute to public" on a new function is explicitly taken away below.

create or replace function public.marketing_recipient_list()
returns table (email text, unsubscribe_token text)
language sql
security definer
set search_path = ''
as $$
  select coalesce(u.email, s.email::text) as email,
         s.unsubscribe_token
    from public.marketing_subscribers s
    left join auth.users u on u.id = s.user_id
   where s.status = 'active';
$$;

-- Revoking from public is what actually locks this down (anon/authenticated
-- inherit execute from there), and it takes service_role's inherited grant with
-- it — hence the explicit grant back to the one role that has to call this.
revoke all on function public.marketing_recipient_list() from public, anon, authenticated;
grant execute on function public.marketing_recipient_list() to service_role;

-- The public archive at theplot.tv/newsletter needs no schema of its own:
-- marketing_newsletter_issues already stores every sent issue (see
-- 20260629002000_marketing_learning_loop.sql) keyed by a unique week_start,
-- which is the slug. It stays service-role only — marketing-feed renders it
-- with the service-role client it already builds, so recipient_count is never
-- exposed to a browser.
