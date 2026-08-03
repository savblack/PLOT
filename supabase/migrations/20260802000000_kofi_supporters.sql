-- Ko-fi supporter tracking.
--
-- PLOT links to ko-fi.com/J7P123TYGK from Settings but nothing has ever
-- received the other half: who actually tipped. This adds it.
--
-- Deliberately separate from billing:
--   billing_customers / is_premium()  = Stripe entitlement (features)
--   kofi_supporters / is_supporter    = Ko-fi gratitude (recognition only)
-- A Ko-fi tip grants no product entitlement. One-off tips don't map onto a
-- recurring subscription, and mixing them would put a second, expiry-less
-- source into is_premium().
--
-- Additive only — the database has real users.
--
-- PII note: kofi_supporters stores donor email, name and message. That is the
-- only thing Ko-fi gives us to match on, so it has to be stored, and the table
-- is service-role only (RLS on, zero policies) — no client ever reads a tip
-- row. The derived is_supporter boolean IS public (section 5): it drives a
-- badge, and a badge nobody can see is pointless. What that discloses is "this
-- person has tipped", never the amount, email, message or count.

-- 1. Tip ledger ---------------------------------------------------------------

create table if not exists public.kofi_supporters (
  kofi_transaction_id           text primary key,
  message_id                    text,
  -- Null when the Ko-fi email matched no PLOT account. The row is still kept:
  -- unmatched tips are the queue for linking by hand later.
  user_id                       uuid references auth.users (id) on delete set null,
  email                         text,
  from_name                     text,
  type                          text,
  is_subscription_payment       boolean not null default false,
  is_first_subscription_payment boolean not null default false,
  tier_name                     text,
  amount                        numeric(12, 2),
  currency                      text,
  message                       text,
  is_public                     boolean not null default false,
  kofi_timestamp                timestamptz,
  received_at                   timestamptz not null default now()
);

create index if not exists kofi_supporters_user_id_idx
  on public.kofi_supporters (user_id)
  where user_id is not null;

-- Unmatched queue: "who tipped that I couldn't link to an account".
create index if not exists kofi_supporters_unmatched_idx
  on public.kofi_supporters (received_at desc)
  where user_id is null;

create index if not exists kofi_supporters_email_idx
  on public.kofi_supporters (lower(email));

alter table public.kofi_supporters enable row level security;
-- No policies: clients can neither read nor write. Only the service role
-- (kofi-webhook edge function) touches this table. Same pattern as
-- billing_customers.

comment on table public.kofi_supporters is
  'Ledger of Ko-fi tips. Service-role only. user_id null = donor email matched no PLOT account (link by hand). Recognition only, grants no entitlement.';

-- 2. Recognition badge --------------------------------------------------------

alter table public.profiles
  add column if not exists is_supporter boolean not null default false;

comment on column public.profiles.is_supporter is
  'Has tipped via Ko-fi at least once. Recognition only — entitlement is is_premium. Exposed publicly as a badge; amount/email/count never are.';

-- 3. Tamper protection --------------------------------------------------------
-- profiles is updated directly by clients (region, timezone, ...), so without
-- this anyone could set their own badge. Extends the existing
-- protect_premium_flag trigger (20260708000000) rather than adding a second
-- trigger, so the two badge columns stay guarded by one rule.

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

  return new;
end;
$$;

drop trigger if exists protect_premium_flag on public.profiles;
create trigger protect_premium_flag
  before update on public.profiles
  for each row execute function public.protect_premium_flag();

-- 4. Webhook entry point ------------------------------------------------------
-- One RPC so the tip write and the email -> user match are a single atomic
-- statement, and so auth.users access stays in the database rather than in an
-- edge function. Idempotent on kofi_transaction_id: Ko-fi retries deliveries.

create or replace function public.record_kofi_tip(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn      text := nullif(trim(p_payload->>'kofi_transaction_id'), '');
  v_email    text := lower(nullif(trim(p_payload->>'email'), ''));
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
    nullif(p_payload->>'timestamp', '')::timestamptz
  )
  on conflict (kofi_transaction_id) do nothing;

  -- 0 rows means the conflict clause fired: Ko-fi has sent this one before.
  get diagnostics v_rows = row_count;

  if v_user is not null then
    update public.profiles set is_supporter = true
     where id = v_user and is_supporter is distinct from true;
  end if;

  return jsonb_build_object(
    'recorded', v_rows > 0,
    'duplicate', v_rows = 0,
    'matched', v_user is not null
  );
end;
$$;

-- Reads auth.users and writes a protected badge — service role only. Postgres
-- grants EXECUTE to PUBLIC by default, so the revoke is load-bearing.
revoke execute on function public.record_kofi_tip(jsonb) from public, anon, authenticated;
grant execute on function public.record_kofi_tip(jsonb) to service_role;

-- 5. Public profile surface ---------------------------------------------------
-- The badge renders wherever the premium badge does, so is_supporter has to
-- ride alongside is_premium through every public projection. The view and the
-- functions are dropped and recreated (not replaced) because a RETURNS TABLE
-- column list can't change in-place — same reason as 20260708010000.

drop view if exists public.public_profiles;
create view public.public_profiles with (security_invoker = off) as
  select id, username, display_name, avatar_url, is_premium, is_supporter
  from public.profiles
  where is_public = true;
grant select on public.public_profiles to anon, authenticated;

-- Re-apply the hardening from 20260721100000 — dropping the view dropped both.
alter view public.public_profiles set (security_barrier = true);

comment on view public.public_profiles is
  'Intentional SECURITY DEFINER public projection. Exposes only id, username, display_name, avatar_url, is_premium and is_supporter where is_public = true. profiles remains RLS-protected; changes require privacy review.';

-- Profile card (shape carried forward from 20260726015000).
drop function if exists public.get_profile_card(text);
create function public.get_profile_card(p_username text)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_supporter boolean, is_public boolean,
               follow_status text, profile_sections text[], bio text, links jsonb)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_supporter, p.is_public,
         (select f.status from public.follows f
            where f.following_id = p.id and f.follower_id = auth.uid()),
         p.profile_sections, p.bio, p.links
  from public.profiles p
  where lower(p.username) = lower(p_username)
    and (p.is_public or auth.uid() is not null)
$$;
grant execute on function public.get_profile_card(text) to anon, authenticated;

-- User search + follow lists (shapes carried forward from 20260708010000).
drop function if exists public.search_users(text);
create function public.search_users(p_query text)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_supporter boolean, is_public boolean,
               follow_status text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_supporter, p.is_public,
         (select f.status from public.follows f
            where f.following_id = p.id and f.follower_id = auth.uid())
  from public.profiles p
  where length(trim(p_query)) >= 2
    and (p.username ilike trim(p_query) || '%' or p.display_name ilike '%' || trim(p_query) || '%')
    and (p.is_public or auth.uid() is not null)
    and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  order by (p.username ilike trim(p_query) || '%') desc, p.username
  limit 25
$$;
grant execute on function public.search_users(text) to anon, authenticated;

drop function if exists public.list_followers(uuid);
create function public.list_followers(p_target uuid)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_supporter boolean, is_public boolean,
               follow_status text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_supporter, p.is_public,
         (select f2.status from public.follows f2 where f2.following_id = p.id and f2.follower_id = auth.uid())
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.following_id = p_target and f.status = 'accepted'
    and (public.is_profile_public(p_target) or public.is_accepted_follower(p_target) or auth.uid() = p_target)
  order by f.created_at desc
  limit 200
$$;
grant execute on function public.list_followers(uuid) to anon, authenticated;

drop function if exists public.list_following(uuid);
create function public.list_following(p_target uuid)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_supporter boolean, is_public boolean,
               follow_status text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_supporter, p.is_public,
         (select f2.status from public.follows f2 where f2.following_id = p.id and f2.follower_id = auth.uid())
  from public.follows f
  join public.profiles p on p.id = f.following_id
  where f.follower_id = p_target and f.status = 'accepted'
    and (public.is_profile_public(p_target) or public.is_accepted_follower(p_target) or auth.uid() = p_target)
  order by f.created_at desc
  limit 200
$$;
grant execute on function public.list_following(uuid) to anon, authenticated;

-- Suggested users (shape carried forward from 20260718110000). Shape must stay
-- aligned with search_users — the same UserList renders both.
drop function if exists public.suggested_users(int);
create function public.suggested_users(p_limit int default 20)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_supporter boolean, is_public boolean,
               follow_status text, post_count bigint)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_supporter, p.is_public,
         null::text as follow_status,
         count(fp.id) as post_count
  from public.profiles p
  left join public.feed_posts fp on fp.author_id = p.id
  where p.is_public
    and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and not exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.following_id = p.id
    )
  group by p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
           p.is_supporter, p.is_public
  order by count(fp.id) desc, p.username asc
  limit least(coalesce(p_limit, 20), 50)
$$;
grant execute on function public.suggested_users(int) to authenticated;
