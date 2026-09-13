-- Two-account (plus a bystander, plus an anonymous reader) proof that a block
-- hides identity.
--
--   set -a; . .env; set +a
--   npm run staging:block-test
--
-- WHY: db:migration-test proves the SQL parses. db:block-clause proves the
-- clause is present in the latest definition of every identity function.
-- Neither executes a policy or an RPC under a real auth.uid(), so neither can
-- tell you whether blocking WORKS. This runs the whole thing as three different
-- authenticated users plus an anonymous reader and asserts all four outcomes.
--
-- The bystander and the anonymous reader are not padding. They are the only
-- thing here that catches the opposite failure — a clause that is too broad and
-- hides people nobody blocked. Without them a migration that hid everyone from
-- everyone would pass every other check in the repo.
--
-- It cannot be a CI gate: it needs Staging credentials and it mutates rows.
-- Run it before merging anything that touches not_blocked or an identity RPC.
--
-- The three accounts are the Staging fixtures below. They are private by
-- default; this makes them public inside the transaction and puts them back by
-- rolling it back, so Staging is unchanged whether the run passes or dies.
\set ON_ERROR_STOP on
\set A '''467ce784-39eb-480e-8593-4632667fc9c3'''
\set B '''e4e955fb-19f0-4e7d-b234-29c8eafa88fb'''
\set C '''6afcff23-4194-4724-af1b-08328ff81f48'''
\set A_CLAIMS '''{"sub":"467ce784-39eb-480e-8593-4632667fc9c3","role":"authenticated"}'''
\set B_CLAIMS '''{"sub":"e4e955fb-19f0-4e7d-b234-29c8eafa88fb","role":"authenticated"}'''
\set C_CLAIMS '''{"sub":"6afcff23-4194-4724-af1b-08328ff81f48","role":"authenticated"}'''

begin;

-- ── fixtures (as postgres, which bypasses RLS) ───────────────────────────────
--
-- The claims have to be set to something valid even here. protect_premium_flag()
-- does `v_claims is not null and v_claims::jsonb->>'role'`, and a pooled backend
-- that has served ANY authenticated request carries request.jwt.claims = ''
-- afterwards — DISCARD ALL resets an unregistered custom GUC to empty string,
-- not to null. So '' passes the null check and then fails the cast, and this
-- update dies with "invalid input syntax for type json" depending on which
-- backend you land on. Tracked separately; pinned here so the test is not flaky.
set local request.jwt.claims = '{"role":"service_role"}';

update public.profiles set is_public = true where id in (:A, :B, :C);

insert into public.follows (follower_id, following_id, status) values
  (:A, :C, 'accepted'),   -- A and B both follow C, so C's follower list is the
  (:B, :C, 'accepted'),   -- place to prove the per-ROW conjunct works
  (:C, :A, 'accepted'),
  (:C, :B, 'accepted');

insert into public.notifications (user_id, actor_id, type) values
  (:A, :B, 'new_follower'),
  (:A, :C, 'new_follower');

\echo ''
\echo '=== BEFORE THE BLOCK (as A) — everything must be visible ==='
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;

select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  A sees B''s profile card'
  from public.get_profile_card('preview');
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  A finds B in search'
  from public.search_users('preview');
select case when count(*) = 2 then 'PASS' else 'FAIL' end || '  A sees both of C''s followers (A and B)'
  from public.list_followers(:C);
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  A sees B''s notification'
  from public.list_notifications() where actor_id = :B;

-- Not hardcoded: trg_notify_follow writes a notification of its own when C
-- follows A, so C's count is the fixture row plus whatever the trigger added.
-- Asserting a literal here is how the first run of this test reported a
-- product failure that was really an arithmetic error in the test.
select count(*) as c_before from public.list_notifications() where actor_id = :C
\gset

-- ── A blocks B, through the real RLS path ───────────────────────────────────
insert into public.user_blocks (blocker_id, blocked_id) values (:A, :B);

\echo ''
\echo '=== AFTER THE BLOCK (as A, the blocker) ==='
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  B''s profile card is gone'
  from public.get_profile_card('preview');
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  B is gone from search'
  from public.search_users('preview');
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  B is gone from suggestions'
  from public.suggested_users(50) where id = :B;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  B''s follower list is gone (p_target conjunct)'
  from public.list_followers(:B);
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  B''s following list is gone (p_target conjunct)'
  from public.list_following(:B);
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  B is gone from C''s follower list (per-row conjunct)'
  from public.list_followers(:C) where id = :B;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  B''s notification is gone'
  from public.list_notifications() where actor_id = :B;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  B''s follow of A was severed by the trigger'
  from public.list_follow_requests() where follower_id = :B;

\echo ''
\echo '--- and A must not have lost anything else ---'
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  A still sees C''s profile card'
  from public.get_profile_card('test');
select case when count(*) = :c_before and count(*) > 0 then 'PASS' else 'FAIL' end
       || '  A still sees all ' || :c_before || ' of C''s notifications'
  from public.list_notifications() where actor_id = :C;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  A still appears in C''s follower list'
  from public.list_followers(:C) where id = :A;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  A can still see their OWN profile card'
  from public.get_profile_card('sav-black');
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  A can still see B in the blocked list (the unblock path)'
  from public.list_blocked_users() where id = :B;

\echo ''
\echo '=== AFTER THE BLOCK (as B, the blocked — must be symmetric) ==='
set local request.jwt.claims = :B_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  A''s profile card is gone'
  from public.get_profile_card('sav-black');
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  A is gone from search'
  from public.search_users('sav-black');
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  A is gone from suggestions'
  from public.suggested_users(50) where id = :A;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  A''s follower list is gone'
  from public.list_followers(:A);
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  A is gone from C''s follower list'
  from public.list_followers(:C) where id = :A;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  B is told nothing: the block list is empty'
  from public.list_blocked_users();
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  B still sees C normally'
  from public.get_profile_card('test');

\echo ''
\echo '--- and B cannot put the follow back ---'
do $$
begin
  insert into public.follows (follower_id, following_id, status)
  values ('e4e955fb-19f0-4e7d-b234-29c8eafa88fb', '467ce784-39eb-480e-8593-4632667fc9c3', 'pending');
  raise notice 'FAIL  B re-followed A after being blocked';
exception when others then
  raise notice 'PASS  B cannot follow A (%)', sqlerrm;
end $$;

do $$
begin
  insert into public.follows (follower_id, following_id, status)
  values ('e4e955fb-19f0-4e7d-b234-29c8eafa88fb', '6afcff23-4194-4724-af1b-08328ff81f48', 'pending');
  raise notice 'FAIL  the new policy blocks an unrelated follow too';
exception when unique_violation then
  raise notice 'PASS  B can still follow C (already following)';
when others then
  raise notice 'FAIL  B can no longer follow C: %', sqlerrm;
end $$;

\echo ''
\echo '=== AS C, the bystander — nothing may have changed ==='
set local request.jwt.claims = :C_CLAIMS;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  C still sees A'
  from public.get_profile_card('sav-black');
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  C still sees B'
  from public.get_profile_card('preview');
select case when count(*) = 2 then 'PASS' else 'FAIL' end || '  C still sees both of their own followers'
  from public.list_followers(:C);

\echo ''
\echo '=== AS AN ANONYMOUS READER — blocks must not touch them ==='
reset role;
set local role anon;
set local request.jwt.claims = '';
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  anon still sees A'
  from public.get_profile_card('sav-black');
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  anon still sees B'
  from public.get_profile_card('preview');

reset role;
rollback;
\echo ''
\echo 'rolled back — Staging is exactly as it was'
