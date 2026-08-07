-- Ko-fi supporter recency.
--
-- Adds profiles.last_kofi_tip_at so the app can compute a recency-based
-- supporter_status ('active' / 'inactive') instead of mirroring is_supporter,
-- which never resets to false — Ko-fi sends no cancellation signal, so
-- is_supporter stays a one-way, permanent recognition badge by design (see
-- 20260802000000_kofi_supporters). Ko-fi supports monthly memberships as
-- well as one-off tips, so a supporter who stops paying should eventually
-- read as inactive even though their public badge never turns off.
--
-- Also makes record_kofi_tip return the matched user_id, so kofi-webhook's
-- support_converted PostHog event can attribute a conversion to the same
-- Supabase user id every other identified PLOT event uses.
--
-- Whole-body function replacements (see AGENTS.md "create or replace
-- function replaces the WHOLE body") — both are the exact live definitions,
-- confirmed via `select pg_get_functiondef(oid) from pg_proc where proname =
-- '<fn>'` against production on 2026-08-07, with only the changes described
-- inline below. Neither touches an ON CONFLICT target.

-- 1. New column ---------------------------------------------------------------

alter table public.profiles
  add column if not exists last_kofi_tip_at timestamptz;

comment on column public.profiles.last_kofi_tip_at is
  'Timestamp of this user''s most recent Ko-fi payment (Ko-fi''s own timestamp
   field, not when we received it). Drives the recency-based supporter_status
   PostHog property client-side. Null = never tipped. Service-role only, same
   tamper protection as is_supporter.';

-- One-time backfill from existing kofi_supporters rows, so supporters who
-- tipped before this migration don't read as "inactive" until their next
-- tip. Guarded by "is null" so re-running this migration (or a real tip
-- already having set it) is a no-op.
update public.profiles p
   set last_kofi_tip_at = t.max_ts
  from (
    select user_id, max(coalesce(kofi_timestamp, received_at)) as max_ts
      from public.kofi_supporters
     where user_id is not null
     group by user_id
  ) t
 where p.id = t.user_id
   and p.last_kofi_tip_at is null;

-- 2. Tamper protection ---------------------------------------------------------
-- Extends the same trigger as is_premium/is_supporter (rather than a second
-- trigger) so all three donor/billing columns stay guarded by one rule.

create or replace function public.protect_premium_flag()
returns trigger
language plpgsql
as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_is_client boolean;
begin
  -- Direct SQL (dashboard, migrations) has no JWT claims; the service role
  -- has claims with role = service_role. Everything else is a client.
  v_is_client := v_claims is not null
                 and coalesce(v_claims::jsonb->>'role', '') <> 'service_role';

  if not v_is_client then
    return new;
  end if;

  if new.is_premium is distinct from old.is_premium then
    raise exception 'is_premium can only be changed by billing';
  end if;

  if new.is_supporter is distinct from old.is_supporter then
    raise exception 'is_supporter can only be changed by the Ko-fi webhook';
  end if;

  if new.last_kofi_tip_at is distinct from old.last_kofi_tip_at then
    raise exception 'last_kofi_tip_at can only be changed by the Ko-fi webhook';
  end if;

  return new;
end;
$$;

-- 3. record_kofi_tip: bump last_kofi_tip_at, return user_id -------------------
-- The profiles update now runs on every matched delivery, not just the
-- first, so a recurring Ko-fi member's timestamp keeps moving forward each
-- payment. greatest() uses the payload's own timestamp rather than now(), so
-- a replayed/retried delivery (Ko-fi retries, and its test button resends
-- the same fake transaction id) can never push the timestamp forward to
-- "right now" — and it ignores nulls, so a missing timestamp degrades to
-- whichever side is non-null instead of clobbering a real value.

create or replace function public.record_kofi_tip(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn      text := nullif(trim(p_payload->>'kofi_transaction_id'), '');
  v_email    text := lower(nullif(trim(p_payload->>'email'), ''));
  v_tip_at   timestamptz := nullif(p_payload->>'timestamp', '')::timestamptz;
  v_user     uuid;
  v_rows     integer;
begin
  if v_txn is null then
    raise exception 'kofi_transaction_id is required';
  end if;

  -- Email is the only link Ko-fi gives us, and donors often pay with a
  -- different address than they signed up with. A miss is expected, not an
  -- error: the tip is recorded either way.
  if v_email is not null then
    select id into v_user
      from auth.users
     where lower(email) = v_email
     order by created_at
     limit 1;
  end if;

  insert into public.kofi_supporters (
    kofi_transaction_id, message_id, user_id, email, from_name, type,
    is_subscription_payment, is_first_subscription_payment, tier_name,
    amount, currency, message, is_public, kofi_timestamp
  ) values (
    v_txn,
    nullif(p_payload->>'message_id', ''),
    v_user,
    v_email,
    nullif(p_payload->>'from_name', ''),
    nullif(p_payload->>'type', ''),
    coalesce((p_payload->>'is_subscription_payment')::boolean, false),
    coalesce((p_payload->>'is_first_subscription_payment')::boolean, false),
    nullif(p_payload->>'tier_name', ''),
    nullif(p_payload->>'amount', '')::numeric,
    nullif(p_payload->>'currency', ''),
    nullif(p_payload->>'message', ''),
    coalesce((p_payload->>'is_public')::boolean, false),
    v_tip_at
  )
  on conflict (kofi_transaction_id) do nothing;

  -- 0 rows means the conflict clause fired: Ko-fi has sent this one before.
  get diagnostics v_rows = row_count;

  if v_user is not null then
    update public.profiles
       set is_supporter = true,
           last_kofi_tip_at = greatest(last_kofi_tip_at, v_tip_at)
     where id = v_user;
  end if;

  return jsonb_build_object(
    'recorded', v_rows > 0,
    'duplicate', v_rows = 0,
    'matched', v_user is not null,
    'user_id', v_user
  );
end;
$$;
