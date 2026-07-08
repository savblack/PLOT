-- PLOT Supporter billing (Stripe).
--
-- Additive only — the database has real users. Four pieces:
--   1. billing_customers: Stripe subscription state, service-role only
--      (RLS enabled with zero policies, same pattern as the old ai_usage
--      table). Written exclusively by the stripe-webhook edge function.
--   2. stripe_events: webhook idempotency log.
--   3. is_supporter(): the entitlement check. Self-expiring — it compares
--      current_period_end to now(), so a lapsed subscription loses
--      entitlement without any cron. past_due stays entitled (Stripe's
--      dunning retry window) and a 3-day grace covers late webhooks at
--      period rollover.
--   4. Tamper protection + the free-tier custom-list cap. profiles is
--      updated directly by clients (region, timezone, ...), so without the
--      trigger anyone could set their own is_supporter badge.

-- 1. Billing state -----------------------------------------------------------

create table if not exists public.billing_customers (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id     text unique not null,
  stripe_subscription_id text,
  subscription_status    text,
  price_id               text,
  cancel_at_period_end   boolean not null default false,
  current_period_end     timestamptz,
  last_event_at          timestamptz,
  updated_at             timestamptz not null default now()
);

alter table public.billing_customers enable row level security;
-- No policies: clients can neither read nor write. Only the service role
-- (stripe-webhook / stripe-billing edge functions) touches this table.

-- 2. Webhook idempotency log --------------------------------------------------

create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;

-- 3. Entitlement check --------------------------------------------------------

create or replace function public.is_supporter(p_user uuid default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.billing_customers
    where user_id = coalesce(p_user, auth.uid())
      and subscription_status in ('active', 'trialing', 'past_due')
      and current_period_end > now() - interval '3 days'
  );
$$;

grant execute on function public.is_supporter(uuid) to authenticated;

-- 4a. Block client tampering with the supporter flag --------------------------
-- Clients update their own profiles row directly, and the badge column lives
-- there. Allow changes only from the service role (webhook) or direct SQL
-- (no JWT claims — dashboard/admin sessions).

create or replace function public.protect_supporter_flag()
returns trigger
language plpgsql
as $$
begin
  if new.is_supporter is distinct from old.is_supporter
     and current_setting('request.jwt.claims', true) is not null
     and coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'is_supporter can only be changed by billing';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_supporter_flag on public.profiles;
create trigger protect_supporter_flag
  before update on public.profiles
  for each row execute function public.protect_supporter_flag();

-- 4b. Custom-list cap: free accounts create up to 3 lists, supporters
-- unlimited. Grandfathering: the cap only gates INSERT — nobody's existing
-- lists are touched, and a free user with 4+ keeps full read/update/delete.
--
-- The original "Users manage own custom lists" policy is FOR ALL; permissive
-- policies OR together, so an added INSERT policy alone would change nothing.
-- Split it into per-command policies and put the cap on INSERT. The separate
-- "Public custom lists are readable" SELECT policy (20260622000000) is
-- untouched.
--
-- SECURITY DEFINER helper so the WITH CHECK subquery bypasses RLS on the same
-- table (no policy self-reference).

create or replace function public.can_create_custom_list()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_supporter()
      or (select count(*) from public.user_custom_lists where user_id = auth.uid()) < 3;
$$;

grant execute on function public.can_create_custom_list() to authenticated;

drop policy if exists "Users manage own custom lists" on public.user_custom_lists;

create policy "Users read own custom lists"
  on public.user_custom_lists for select
  using (auth.uid() = user_id);

create policy "Users update own custom lists"
  on public.user_custom_lists for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own custom lists"
  on public.user_custom_lists for delete
  using (auth.uid() = user_id);

create policy "Users create custom lists within plan cap"
  on public.user_custom_lists for insert
  with check (auth.uid() = user_id and public.can_create_custom_list());
