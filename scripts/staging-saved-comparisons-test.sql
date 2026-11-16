-- Proof that saved comparisons belong to one viewer, hide blocked accounts,
-- and cannot be reached except through their three functions.
--
--   pnpm run staging:test -- saved-comparisons
--
-- WHY: db:migration-test proves the SQL parses and db:block-clause proves the
-- not_blocked clause is present in list_saved_comparisons(). Neither runs the
-- functions as a signed-in user, so neither can tell whether B can see A's
-- list, whether a block really hides the row, or whether the table is open to
-- the API after all.
--
-- Viewpoints: A the saver, B an unrelated bystander, C the person saved (and
-- later the blocker), and an anonymous caller. The rollback at the end removes
-- every fixture row.
\set ON_ERROR_STOP on
\set A '''467ce784-39eb-480e-8593-4632667fc9c3'''
\set B '''e4e955fb-19f0-4e7d-b234-29c8eafa88fb'''
\set C '''6afcff23-4194-4724-af1b-08328ff81f48'''
\set A_CLAIMS '''{"sub":"467ce784-39eb-480e-8593-4632667fc9c3","role":"authenticated"}'''
\set B_CLAIMS '''{"sub":"e4e955fb-19f0-4e7d-b234-29c8eafa88fb","role":"authenticated"}'''
\set C_CLAIMS '''{"sub":"6afcff23-4194-4724-af1b-08328ff81f48","role":"authenticated"}'''

begin;

-- Valid claims even as postgres; see the note in staging-block-test.sql.
set local request.jwt.claims = '{"role":"service_role"}';
delete from public.saved_comparisons where viewer_id in (:A, :B, :C) or target_id in (:A, :B, :C);
delete from public.user_blocks where :A in (blocker_id, blocked_id) or :C in (blocker_id, blocked_id);

\echo '=== A saves C ==='
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
select public.save_comparison(:C);
select case when count(*) = 1 and bool_and(id = :C) then 'PASS' else 'FAIL' end || '  A sees C in their list'
  from public.list_saved_comparisons();
select case when bool_and(username is not null) then 'PASS' else 'FAIL' end || '  the row carries the handle'
  from public.list_saved_comparisons();

select public.save_comparison(:C);
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  saving the same person again keeps one row'
  from public.list_saved_comparisons();

select public.save_comparison(:A);
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  A cannot save themself'
  from public.list_saved_comparisons();

select public.save_comparison('00000000-0000-0000-0000-000000000000');
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  an account that does not exist is skipped, not an error'
  from public.list_saved_comparisons();

\echo ''
\echo '=== the table itself is closed ==='
select case when not has_table_privilege('authenticated', 'public.saved_comparisons', 'select')
             and not has_table_privilege('authenticated', 'public.saved_comparisons', 'insert')
             and not has_table_privilege('authenticated', 'public.saved_comparisons', 'delete')
             and not has_table_privilege('anon', 'public.saved_comparisons', 'select')
            then 'PASS' else 'FAIL' end || '  no client role can read or write saved_comparisons directly';
select case when relrowsecurity then 'PASS' else 'FAIL' end || '  RLS is on'
  from pg_class where oid = 'public.saved_comparisons'::regclass;

\echo ''
\echo '=== bystander B, and C who was saved ==='
set local request.jwt.claims = :B_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  B does not see A''s list'
  from public.list_saved_comparisons();
select public.remove_saved_comparison(:C);
set local request.jwt.claims = :C_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  C cannot see that A saved them'
  from public.list_saved_comparisons();
set local request.jwt.claims = :A_CLAIMS;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  B removing C touched only B''s own (empty) list'
  from public.list_saved_comparisons();

\echo ''
\echo '=== C blocks A ==='
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
insert into public.user_blocks (blocker_id, blocked_id) values (:C, :A);
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  a block hides C from A''s list'
  from public.list_saved_comparisons();

reset role;
set local request.jwt.claims = '{"role":"service_role"}';
delete from public.saved_comparisons where viewer_id = :A;
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
select public.save_comparison(:C);
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  A cannot save someone who has blocked them'
  from public.saved_comparisons where viewer_id = :A;

\echo ''
\echo '=== remove ==='
delete from public.user_blocks where blocker_id = :C and blocked_id = :A;
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
select public.save_comparison(:C);
select public.remove_saved_comparison(:C);
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  the x removes the row'
  from public.list_saved_comparisons();

\echo ''
\echo '=== grants ==='
reset role;
select case when has_function_privilege('authenticated', 'public.list_saved_comparisons()', 'execute')
             and has_function_privilege('authenticated', 'public.save_comparison(uuid)', 'execute')
             and has_function_privilege('authenticated', 'public.remove_saved_comparison(uuid)', 'execute')
            then 'PASS' else 'FAIL' end || '  authenticated may call all three';
select case when not has_function_privilege('anon', 'public.list_saved_comparisons()', 'execute')
             and not has_function_privilege('anon', 'public.save_comparison(uuid)', 'execute')
             and not has_function_privilege('anon', 'public.remove_saved_comparison(uuid)', 'execute')
            then 'PASS' else 'FAIL' end || '  anon may call none of them';

rollback;
\echo 'rolled back'
