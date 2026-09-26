-- Proof that refresh_premium_badges() clears a stale Premium badge once
-- past_due grace has run out, and touches nothing else.
--
--   set -a; . .env; set +a
--   npm run staging:premium-badge-refresh-test
--
-- WHY: the badge is written by apply_stripe_subscription_event at the moment a
-- Stripe event lands. Grace then expires with no event, so the badge used to
-- stay true while is_premium() already denied access. db:migration-test proves
-- the migration applies; only this proves the function fixes the drift, and
-- that it leaves a no-billing (legacy supporter) badge alone.
--
-- The migration is applied INSIDE the transaction (\ir below), and the whole
-- run ends in rollback, so Staging keeps no function, cron job or fixture.
--
-- Accounts are the three Staging fixtures the block test uses:
--   A  past_due for 4 days: grace over, badge stale      -> cleared
--   B  past_due for 1 day: still in grace                -> kept
--   C  no billing row, badge true (a legacy supporter)   -> untouched
\set ON_ERROR_STOP on
\set A '''467ce784-39eb-480e-8593-4632667fc9c3'''
\set B '''e4e955fb-19f0-4e7d-b234-29c8eafa88fb'''
\set C '''6afcff23-4194-4724-af1b-08328ff81f48'''

begin;

set local request.jwt.claims = '{"role":"service_role"}';

-- Staging never received 20260913100000, so its protect_premium_flag() still
-- crashes on the empty claims a pooled backend carries. Production has the
-- fixed body; load it here (idempotent where already live) so this runs
-- against what production runs.
\ir ../supabase/migrations/20260913100000_premium_flag_empty_claims.sql
\ir ../supabase/migrations/20260926160000_refresh_premium_badges.sql

-- ── fixtures ─────────────────────────────────────────────────────────────────
delete from public.billing_customers where user_id in (:A, :B, :C);

-- The real event path, dated so A's first failed renewal was 4 days ago and B's
-- 1 day ago. Both periods still end in the future, which is the case the badge
-- got wrong: Stripe keeps pushing the period end while the invoice is unpaid.
select public.apply_stripe_subscription_event(
  'evt_badge_proof_a', 'customer.subscription.updated', now() - interval '4 days',
  :A, 'cus_badge_proof_a', 'sub_badge_proof_a', 'past_due', 'price_test', false,
  now() + interval '20 days') is not null as a_applied
\gset
select public.apply_stripe_subscription_event(
  'evt_badge_proof_b', 'customer.subscription.updated', now() - interval '1 day',
  :B, 'cus_badge_proof_b', 'sub_badge_proof_b', 'past_due', 'price_test', false,
  now() + interval '20 days') is not null as b_applied
\gset

-- The event path writes the badge as is_premium() at call time, which for A is
-- already false. Set it to what the webhook wrote 4 days ago, while A was still
-- inside grace. No claims = the direct-SQL path protect_premium_flag() allows,
-- the same one pg_cron uses.
set local request.jwt.claims = '';
update public.profiles set is_premium = true where id in (:A, :B, :C);

select case when public.is_premium(:A) = false and public.is_premium(:B) = true
            then 'PASS' else 'FAIL' end || '  fixture: A is past grace, B is inside it';
select case when (select bool_and(is_premium) from public.profiles where id in (:A, :B, :C))
            then 'PASS' else 'FAIL' end || '  fixture: all three badges start true (A''s is stale)';

-- Other Staging billing accounts may already have drifted for real; the job
-- fixes those too. So expect exactly the drift present right now, A included.
select count(*) as drifted
  from public.profiles p join public.billing_customers b on b.user_id = p.id
 where p.is_premium is distinct from public.is_premium(p.id)
\gset

\echo ''
\echo '=== refresh, as pg_cron runs it (no JWT) ==='
select public.refresh_premium_badges() as changed
\gset
select case when :changed = :drifted and :drifted >= 1
            then 'PASS' else 'FAIL' end || '  changed exactly the drifted badges (' || :changed || ' of ' || :drifted || ')';
select case when (select is_premium from public.profiles where id = :A) = false
            then 'PASS' else 'FAIL' end || '  A: stale badge cleared once grace ran out';
select case when (select is_premium from public.profiles where id = :B) = true
            then 'PASS' else 'FAIL' end || '  B: badge kept while still inside grace';
select case when (select is_premium from public.profiles where id = :C) = true
            then 'PASS' else 'FAIL' end || '  C: no billing row, badge left alone';
select case when public.refresh_premium_badges() = 0
            then 'PASS' else 'FAIL' end || '  a second run changes nothing';

\echo ''
\echo '=== schedule and grants ==='
-- A DO block, because plain SQL naming cron.job fails at parse time on a
-- database without pg_cron (Staging has none; production does).
do $$
begin
  if to_regnamespace('cron') is null then
    raise notice 'SKIP  no pg_cron here: schedule not checked';
  elsif exists (select 1 from cron.job
                 where jobname = 'refresh-premium-badges'
                   and schedule = '17 * * * *'
                   and command like '%refresh_premium_badges()%') then
    raise notice 'PASS  hourly cron job registered';
  else
    raise notice 'FAIL  hourly cron job registered';
  end if;
end $$;
select case when not has_function_privilege('authenticated', 'public.refresh_premium_badges()', 'execute')
            then 'PASS' else 'FAIL' end || '  authenticated may not call it';
select case when not has_function_privilege('anon', 'public.refresh_premium_badges()', 'execute')
            then 'PASS' else 'FAIL' end || '  anon may not call it';

rollback;
\echo 'rolled back'
