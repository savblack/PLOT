-- Proof that one visibility rule governs profile content, and that each custom
-- list's visibility setting means what its label says.
--
--   set -a; . .env; set +a
--   npm run staging:visibility-test
--
-- WHY: db:migration-test proves 20260926090000 applies to a copy of production,
-- but it never runs a policy under a real auth.uid(). This does, from five
-- viewpoints: the owner, an accepted follower, a signed-in stranger, an
-- anonymous reader, and a blocked user. The stranger and the anonymous reader
-- catch a rule that is too BROAD; the follower catches one that is too narrow.
--
-- It applies the migration itself, inside the transaction, so it runs whether
-- or not Staging has the migration yet, and the final rollback removes both the
-- migration and every fixture. Staging is unchanged whether it passes or dies.
--
-- Title ids are borrowed from rows already on Staging (they came from TMDB);
-- never invent them.
\set ON_ERROR_STOP on
\set A '''467ce784-39eb-480e-8593-4632667fc9c3'''
\set B '''e4e955fb-19f0-4e7d-b234-29c8eafa88fb'''
\set C '''6afcff23-4194-4724-af1b-08328ff81f48'''
\set A_CLAIMS '''{"sub":"467ce784-39eb-480e-8593-4632667fc9c3","role":"authenticated"}'''
\set B_CLAIMS '''{"sub":"e4e955fb-19f0-4e7d-b234-29c8eafa88fb","role":"authenticated"}'''
\set C_CLAIMS '''{"sub":"6afcff23-4194-4724-af1b-08328ff81f48","role":"authenticated"}'''

begin;

-- ── fixtures, before the migration (as postgres) ─────────────────────────────
-- See staging-block-test.sql for why the claims must be valid even here.
set local request.jwt.claims = '{"role":"service_role"}';

select tmdb_id as t1, media_type as m1, title as n1 from public.history order by tmdb_id limit 1
\gset
select tmdb_id as t2, media_type as m2, title as n2 from public.history where tmdb_id <> :t1 order by tmdb_id limit 1
\gset

update public.profiles set is_public = false where id = :A;
update public.profiles set is_public = true  where id in (:B, :C);
delete from public.follows where (follower_id, following_id) in ((:B, :A), (:C, :A));
-- trg_set_follow_status makes any follow of a private profile 'pending';
-- approving it is a separate update, exactly as in the app.
insert into public.follows (follower_id, following_id) values (:B, :A);
update public.follows set status = 'accepted' where follower_id = :B and following_id = :A;

-- A list made "public" before visibility existed, on a private profile. The
-- backfill makes it 'public', which the private profile caps at followers.
insert into public.user_custom_lists (user_id, name, is_public)
  values (:A, 'vis-test legacy', true);

\i supabase/migrations/20260926090000_unified_profile_visibility.sql

set local request.jwt.claims = '{"role":"service_role"}';

insert into public.lists (user_id, name) values (:A, 'vis-test watchlist') returning id as wl
\gset
insert into public.list_items (list_id, user_id, tmdb_id, media_type) values (:'wl', :A, :t1, :'m1');
insert into public.watching_progress (user_id, tmdb_id, title) values (:A, :t2, :'n2');
insert into public.feed_posts (author_id) values (:A);

insert into public.user_custom_lists (user_id, name, visibility) values
  (:A, 'vis-test private',   'private'),
  (:A, 'vis-test followers', 'followers'),
  (:A, 'vis-test public',    'public'),
  (:A, 'vis-test link',      'link');
insert into public.user_custom_list_items (list_id, user_id, tmdb_id, media_type, title)
  select id, :A, :t1, :'m1', :'n1' from public.user_custom_lists where user_id = :A and name like 'vis-test %';
select id as link_id from public.user_custom_lists where user_id = :A and name = 'vis-test link'
\gset
select id as public_id from public.user_custom_lists where user_id = :A and name = 'vis-test public'
\gset

\echo ''
\echo '=== migration: backfill and the is_public mirror ==='
select case when visibility = 'public' and is_public then 'PASS' else 'FAIL' end
       || '  legacy public list became public'
  from public.user_custom_lists where user_id = :A and name = 'vis-test legacy';
select case when bool_and(is_public = (visibility in ('public', 'link'))) then 'PASS' else 'FAIL' end
       || '  is_public mirrors visibility on insert'
  from public.user_custom_lists where user_id = :A and name like 'vis-test %';

-- An app build that only knows is_public still works.
update public.user_custom_lists set is_public = false where user_id = :A and name = 'vis-test legacy';
select case when visibility = 'private' then 'PASS' else 'FAIL' end || '  old client "Make private" sets private'
  from public.user_custom_lists where user_id = :A and name = 'vis-test legacy';
update public.user_custom_lists set is_public = true where user_id = :A and name = 'vis-test legacy';
select case when visibility = 'public' then 'PASS' else 'FAIL' end || '  old client "Make public" sets public'
  from public.user_custom_lists where user_id = :A and name = 'vis-test legacy';
update public.user_custom_lists set visibility = 'followers' where user_id = :A and name = 'vis-test legacy';
select case when not is_public then 'PASS' else 'FAIL' end || '  new client setting followers clears is_public'
  from public.user_custom_lists where user_id = :A and name = 'vis-test legacy';
delete from public.user_custom_lists where user_id = :A and name = 'vis-test legacy';

\echo ''
\echo '=== A is PRIVATE. As A (owner) ==='
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
select case when count(*) = 4 then 'PASS' else 'FAIL' end || '  owner sees all four of their lists'
  from public.user_custom_lists where user_id = :A and name like 'vis-test %';

\echo ''
\echo '=== As B (accepted follower of private A) ==='
set local request.jwt.claims = :B_CLAIMS;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  follower sees Want to Watch (newly allowed)'
  from public.list_items where user_id = :A and tmdb_id = :t1;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  follower sees Watching progress (newly allowed)'
  from public.watching_progress where user_id = :A and tmdb_id = :t2;
select case when count(*) >= 1 then 'PASS' else 'FAIL' end || '  follower sees feed posts'
  from public.feed_posts where author_id = :A;
select case when string_agg(visibility, ',' order by visibility) = 'followers,public' then 'PASS' else 'FAIL' end
       || '  follower lists followers and public lists (never link or private)'
  from public.user_custom_lists where user_id = :A and name like 'vis-test %';
select case when count(*) = 2 then 'PASS' else 'FAIL' end || '  follower sees the items of the followers and public lists only'
  from public.user_custom_list_items i
  join public.user_custom_lists l on l.id = i.list_id
 where i.user_id = :A and l.name like 'vis-test %';
-- Dynamic, because Staging can lag production and not have this table yet.
do $$
declare n int;
begin
  if to_regclass('public.private_title_notes') is null then
    raise notice 'SKIP  private_title_notes is not on Staging yet';
    return;
  end if;
  execute 'select count(*) from public.private_title_notes where user_id = $1'
    into n using '467ce784-39eb-480e-8593-4632667fc9c3'::uuid;
  raise notice '%  follower cannot read A''s private notes', case when n = 0 then 'PASS' else 'FAIL' end;
end $$;

\echo ''
\echo '=== As C (signed in, not following private A) ==='
set local request.jwt.claims = :C_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  stranger cannot see Want to Watch'
  from public.list_items where user_id = :A;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  stranger cannot see Watching'
  from public.watching_progress where user_id = :A;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  stranger cannot see feed posts'
  from public.feed_posts where author_id = :A;
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || '  stranger lists none of A''s lists (public is capped by the private profile)'
  from public.user_custom_lists where user_id = :A and name like 'vis-test %';
select case when count(*) = 1 and sum(jsonb_array_length(items)) = 1 then 'PASS' else 'FAIL' end
       || '  stranger opens the link list by id, with its items'
  from public.get_shared_list(:'link_id');
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || '  stranger cannot open the public list of a private profile by id'
  from public.get_shared_list(:'public_id');

\echo ''
\echo '=== As anon, private A ==='
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  anon cannot see Want to Watch'
  from public.list_items where user_id = :A;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  anon cannot enumerate any of A''s lists'
  from public.user_custom_lists where user_id = :A and name like 'vis-test %';
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  anon cannot enumerate ANY link list'
  from public.user_custom_lists where visibility = 'link';
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  anon opens the link list by id'
  from public.get_shared_list(:'link_id');
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  anon cannot find private A in public_profiles'
  from public.public_profiles where id = :A;

\echo ''
\echo '=== A goes PUBLIC ==='
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
update public.profiles set is_public = true where id = :A;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  anon sees Want to Watch'
  from public.list_items where user_id = :A and tmdb_id = :t1;
select case when string_agg(visibility, ',') = 'public' then 'PASS' else 'FAIL' end
       || '  anon lists only the public list'
  from public.user_custom_lists where user_id = :A and name like 'vis-test %';

set local role authenticated;
set local request.jwt.claims = :C_CLAIMS;
select case when string_agg(visibility, ',') = 'public' then 'PASS' else 'FAIL' end
       || '  signed-in non-follower lists only the public list'
  from public.user_custom_lists where user_id = :A and name like 'vis-test %';

\echo ''
\echo '=== A blocks C: nothing crosses a block ==='
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
insert into public.user_blocks (blocker_id, blocked_id) values (:A, :C);

set local role authenticated;
set local request.jwt.claims = :C_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  blocked: no Want to Watch'
  from public.list_items where user_id = :A;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  blocked: no feed posts (was readable before)'
  from public.feed_posts where author_id = :A;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  blocked: no lists'
  from public.user_custom_lists where user_id = :A and name like 'vis-test %';
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  blocked: cannot open the link list by id'
  from public.get_shared_list(:'link_id');
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  blocked: public_profiles hides A (was visible before)'
  from public.public_profiles where id = :A;

set local request.jwt.claims = :B_CLAIMS;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  bystander B still sees A in public_profiles'
  from public.public_profiles where id = :A;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  bystander B still sees A''s Want to Watch'
  from public.list_items where user_id = :A and tmdb_id = :t1;

rollback;
