-- Rollback-only proof for the database fixes in
-- 20260918030000_security_scan_remediation.sql. The migration itself runs
-- inside this transaction, so Staging does not need to be advanced first and
-- is unchanged even when a check fails.
\set ON_ERROR_STOP on
\set A '''467ce784-39eb-480e-8593-4632667fc9c3'''
\set B '''e4e955fb-19f0-4e7d-b234-29c8eafa88fb'''
\set C '''6afcff23-4194-4724-af1b-08328ff81f48'''
\set A_CLAIMS '''{"sub":"467ce784-39eb-480e-8593-4632667fc9c3","role":"authenticated"}'''
\set B_CLAIMS '''{"sub":"e4e955fb-19f0-4e7d-b234-29c8eafa88fb","role":"authenticated"}'''

begin;
set local request.jwt.claims = '{"role":"service_role"}';
-- Staging intentionally trails Production and does not yet carry the scheduled
-- Linear wrapper. Supply only its signature so this migration's ACL change can
-- be exercised; the transaction rolls the fixture back with everything else.
select $ddl$
  create function public.run_marketing_linear_mirror() returns void
  language sql as 'select null::void'
$ddl$
where to_regprocedure('public.run_marketing_linear_mirror()') is null
\gexec
\ir ../supabase/migrations/20260918030000_security_scan_remediation.sql

\echo '=== PRIVILEGED RPC ACLS ==='
select case when not has_function_privilege('anon', 'public.auth_note_fail(text,text,bigint)', 'execute')
                  and not has_function_privilege('authenticated', 'public.auth_note_fail(text,text,bigint)', 'execute')
            then 'PASS' else 'FAIL' end || '  auth throttle mutation is service-only';
select case when not has_function_privilege('anon', 'public.run_marketing_linear_mirror()', 'execute')
                  and not has_function_privilege('authenticated', 'public.run_marketing_linear_mirror()', 'execute')
            then 'PASS' else 'FAIL' end || '  Linear sweep is service-only';
select case when not has_function_privilege('anon', 'public.admit_critic_score_request(text)', 'execute')
                  and has_function_privilege('service_role', 'public.admit_critic_score_request(text)', 'execute')
            then 'PASS' else 'FAIL' end || '  critic quota mutation is service-only';

set local role service_role;
select case when count(*) filter (where allowed) = 30
                  and count(*) filter (where not allowed) = 1
            then 'PASS' else 'FAIL' end || '  critic quota atomically enforces its caller limit'
from (
  select public.admit_critic_score_request('test-bucket' || left(i::text, 0)) as allowed
  from generate_series(1, 31) i
) attempts;
select case when public.claim_marketing_linear_mirror('40000000-0000-0000-0000-000000000001')
                  and not public.claim_marketing_linear_mirror('40000000-0000-0000-0000-000000000002')
            then 'PASS' else 'FAIL' end || '  Linear mirror lease admits only one owner';
select public.release_marketing_linear_mirror('40000000-0000-0000-0000-000000000001');
select case when public.claim_marketing_linear_mirror('40000000-0000-0000-0000-000000000002')
            then 'PASS' else 'FAIL' end || '  released Linear mirror lease is reusable';
do $$
begin
  perform public.auth_note_fail('test', '127.0.0.1', -1);
  raise notice 'FAIL  auth throttle accepted a negative window';
exception when invalid_parameter_value then
  raise notice 'PASS  auth throttle rejects an invalid window';
end $$;
reset role;
set local request.jwt.claims = '{"role":"service_role"}';

select case when exists (
  select 1 from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'Owners can delete feedback attachments'
    and qual like '%owner_id%auth.uid%'
) then 'PASS' else 'FAIL' end || '  attachment deletion is bound to Storage ownership';

\echo '=== CUSTOM LIST OWNERSHIP ==='
delete from public.user_custom_list_items where list_id in (
  select id from public.user_custom_lists where name like '__security_scan_test_%'
);
delete from public.user_custom_lists where name like '__security_scan_test_%';
insert into public.user_custom_lists (id, user_id, name)
values
  ('10000000-0000-0000-0000-000000000001', :A, '__security_scan_test_a'),
  ('10000000-0000-0000-0000-000000000002', :B, '__security_scan_test_b');

set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
do $$
begin
  insert into public.user_custom_list_items (list_id, user_id, tmdb_id, media_type, title)
  values ('10000000-0000-0000-0000-000000000002', '467ce784-39eb-480e-8593-4632667fc9c3', 999991, 'movie', 'cross-owner');
  raise notice 'FAIL  cross-owner custom-list insert succeeded';
exception when others then
  raise notice 'PASS  cross-owner custom-list insert was rejected';
end $$;
insert into public.user_custom_list_items (list_id, user_id, tmdb_id, media_type, title)
values ('10000000-0000-0000-0000-000000000001', '467ce784-39eb-480e-8593-4632667fc9c3', 999992, 'movie', 'owned');
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  owner can still add their own list item'
from public.user_custom_list_items where list_id = '10000000-0000-0000-0000-000000000001';

\echo '=== FOLLOW INTEGRITY AND GRAPH PRIVACY ==='
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
delete from public.follows where follower_id in (:A, :B, :C) and following_id in (:A, :B, :C);
update public.profiles set is_public = false where id = :B;
update public.profiles set is_public = true where id in (:A, :C);
insert into public.follows (follower_id, following_id) values (:A, :B);
insert into public.follows (follower_id, following_id) values (:A, :C);

set local role authenticated;
set local request.jwt.claims = :B_CLAIMS;
do $$
begin
  update public.follows
     set follower_id = '6afcff23-4194-4724-af1b-08328ff81f48', status = 'accepted'
   where follower_id = '467ce784-39eb-480e-8593-4632667fc9c3'
     and following_id = 'e4e955fb-19f0-4e7d-b234-29c8eafa88fb';
  raise notice 'FAIL  follow approval changed the follower endpoint';
exception when others then
  raise notice 'PASS  follow approval cannot change either endpoint';
end $$;
update public.follows set status = 'accepted'
 where follower_id = :A and following_id = :B;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  target can still accept a pending request'
from public.follows where follower_id = :A and following_id = :B and status = 'accepted';

-- B is unrelated to the accepted A→C row. Raw table access must not expose it,
-- while the public C profile still gets correct aggregate counts through RPC.
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  unrelated user cannot read raw social-graph rows'
from public.follows where follower_id = :A and following_id = :C;
select case when followers = 1 then 'PASS' else 'FAIL' end || '  authorized count RPC preserves public profile counts'
from public.get_follow_counts(:C);

\echo '=== NOTIFICATION MUTATION ==='
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
insert into public.notifications (id, user_id, actor_id, type)
values ('20000000-0000-0000-0000-000000000001', :A, :C, 'new_follower');
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
do $$
begin
  update public.notifications
     set post_id = '30000000-0000-0000-0000-000000000001'
   where id = '20000000-0000-0000-0000-000000000001';
  raise notice 'FAIL  recipient changed notification post_id';
exception when insufficient_privilege then
  raise notice 'PASS  recipient cannot change notification post_id';
end $$;
update public.notifications set read_at = now()
 where id = '20000000-0000-0000-0000-000000000001';
select case when read_at is not null then 'PASS' else 'FAIL' end || '  recipient can still mark notifications read'
from public.notifications where id = '20000000-0000-0000-0000-000000000001';

reset role;
rollback;
\echo 'rolled back — Staging is exactly as it was'
