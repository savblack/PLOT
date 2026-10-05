-- Proof that accepting a Watch together request between people who follow each
-- other shares the sender's watchlist, and that it doesn't otherwise.
--
--   set -a; . .env; set +a
--   pnpm run staging:watch-together-mutual-test
--
-- WHY: 20261004100000 set a column 20260927160000 had dropped, and neither
-- migrations:check nor db:migration-test notices that (plpgsql resolves NEW's
-- fields only when the line runs). This runs the real accept under a real
-- auth.uid(). Pass `-v nofix=1` through psql to leave the fix migration out and
-- see the original trigger fail.
--
-- Applies the two migrations itself inside the transaction and ends in
-- rollback, so Staging and its ledger are unchanged whether it passes or dies.
-- A, B and C are the Staging fixtures used by staging-watch-together-test.sql.
\set ON_ERROR_STOP on
\set A '''467ce784-39eb-480e-8593-4632667fc9c3'''
\set B '''e4e955fb-19f0-4e7d-b234-29c8eafa88fb'''
\set C '''6afcff23-4194-4724-af1b-08328ff81f48'''
\set A_CLAIMS '''{"sub":"467ce784-39eb-480e-8593-4632667fc9c3","role":"authenticated"}'''
\set B_CLAIMS '''{"sub":"e4e955fb-19f0-4e7d-b234-29c8eafa88fb","role":"authenticated"}'''
\set C_CLAIMS '''{"sub":"6afcff23-4194-4724-af1b-08328ff81f48","role":"authenticated"}'''

begin;

\ir ../supabase/migrations/20261004100000_watch_together_mutual_follow_share.sql
\if :{?nofix}
\else
\ir ../supabase/migrations/20261005100000_watch_together_mutual_follow_share_fix.sql
\endif

set local request.jwt.claims = '{"role":"service_role"}';
delete from public.watch_together where requester_id in (:A, :B, :C) or recipient_id in (:A, :B, :C);
delete from public.watch_together_closed where requester_id in (:A, :B, :C) or recipient_id in (:A, :B, :C);
delete from public.watchlist_viewers where owner_id in (:A, :B, :C);
delete from public.follows where follower_id in (:A, :B, :C) and following_id in (:A, :B, :C);
delete from public.user_blocks where blocker_id in (:A, :B, :C) and blocked_id in (:A, :B, :C);
-- Everyone private, anyone can send requests, A and B follow each other, A
-- follows C but C doesn't follow A. A is Premium so pairing can decide.
update public.profiles set is_public = false, watchlist_visibility = null, watch_together_requests_from = 'profile' where id in (:A, :B, :C);
delete from public.billing_customers where user_id in (:A, :B, :C);
insert into public.billing_customers (user_id, stripe_customer_id, subscription_status, current_period_end)
  values (:A, 'cus_wt_mutual_proof', 'active', now() + interval '30 days');
update public.profiles set is_public = true where id in (:A, :B, :C);
insert into public.follows (follower_id, following_id) values (:A, :B), (:B, :A), (:A, :C);
update public.profiles set is_public = false where id in (:A, :B, :C);

\echo ''
\echo '=== Mutual follows: A and B ==='
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
select case when public.send_watch_together_request(:B) = 'pending' then 'PASS' else 'FAIL' end || '  A sends B a request';
set local request.jwt.claims = :B_CLAIMS;
select public.respond_watch_together_request(:A, true);
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  B accepted without an error, A and B are paired'
  from public.list_watch_together() where other_id = :A and direction = 'paired';
select case when public.can_view_watchlist(:A) then 'PASS' else 'FAIL' end || '  B can now see A''s full watchlist (A was private)';
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
select case when watchlist_visibility = 'selected' then 'PASS' else 'FAIL' end || '  A''s watchlist moved from private to selected people'
  from public.profiles where id = :A;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  A shares with B only'
  from public.watchlist_viewers where owner_id = :A;
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
select case when not public.can_view_watchlist(:B) then 'PASS' else 'FAIL' end || '  A cannot see B''s watchlist (B accepted without sharing)';

\echo ''
\echo '=== A follows C, C does not follow A ==='
set local request.jwt.claims = :A_CLAIMS;
select case when public.send_watch_together_request(:C) = 'pending' then 'PASS' else 'FAIL' end || '  A sends C a request';
set local request.jwt.claims = :C_CLAIMS;
select public.respond_watch_together_request(:A, true);
select case when not public.can_view_watchlist(:A) then 'PASS' else 'FAIL' end || '  C cannot see A''s watchlist (not mutual, nothing shared)';

rollback;
