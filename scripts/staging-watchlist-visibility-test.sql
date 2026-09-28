-- Proof that "Who can see your Want to Watch" (20260927160000) means what each
-- choice says, under a real auth.uid().
--
--   set -a; . .env; set +a
--   npm run staging:watchlist-visibility-test
--
-- Viewpoints: the owner A, an accepted follower B, a signed-in stranger C and
-- an anonymous reader, for each setting on a private and a public profile. The
-- stranger and anon catch a rule that is too BROAD; B catches one too narrow.
--
-- It applies the migration itself, inside the transaction, and ends in
-- rollback, so Staging (and its ledger) is unchanged whether it passes or dies.
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

-- Production runs #1071's migration first; so does this, in case Staging lacks it.
\ir ../supabase/migrations/20260927150000_watch_together_counts_for_followers.sql
\ir ../supabase/migrations/20260927160000_watchlist_visibility.sql

-- ── fixtures (as postgres) ───────────────────────────────────────────────────
-- See staging-block-test.sql for why the claims must be valid even here.
set local request.jwt.claims = '{"role":"service_role"}';

select tmdb_id as t1, media_type as m1, title as n1 from public.history order by tmdb_id limit 1
\gset

delete from public.follows where follower_id in (:A, :B, :C) and following_id in (:A, :B, :C);
delete from public.user_blocks where blocker_id in (:A, :B, :C) and blocked_id in (:A, :B, :C);
delete from public.watch_together where requester_id in (:A, :B, :C) or recipient_id in (:A, :B, :C);
delete from public.watchlist_viewers where owner_id in (:A, :B, :C);
update public.profiles set is_public = false, watchlist_visibility = null where id = :A;
update public.profiles set is_public = true where id in (:B, :C);
-- A private target makes the follow pending; approving is a separate update.
insert into public.follows (follower_id, following_id) values (:B, :A);
update public.follows set status = 'accepted' where follower_id = :B and following_id = :A;

insert into public.lists (user_id, name) values (:A, 'My List') on conflict (user_id, name) do nothing;
insert into public.list_items (list_id, user_id, tmdb_id, media_type, title)
  select l.id, :A, :t1, :'m1', :'n1' from public.lists l where l.user_id = :A and l.name = 'My List'
  on conflict (list_id, tmdb_id) do nothing;

\echo '=== A private, setting unset (only me) ==='
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
select case when count(*) >= 1 then 'PASS' else 'FAIL' end || '  owner sees their own watchlist'
  from public.list_items where user_id = :A;
set local request.jwt.claims = :B_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  follower B no longer sees it (was allowed by 20260926090000)'
  from public.list_items where user_id = :A;
select case when public.can_view_profile(:A) then 'PASS' else 'FAIL' end || '  follower B can still see the rest of A''s profile';
select case when not public.can_view_watchlist(:A) then 'PASS' else 'FAIL' end || '  can_view_watchlist agrees for B';
set local request.jwt.claims = :C_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  stranger C cannot see it'
  from public.list_items where user_id = :A;

\echo ''
\echo '=== A private, followers ==='
reset role; set local request.jwt.claims = '{"role":"service_role"}';
update public.profiles set watchlist_visibility = 'followers' where id = :A;
set local role authenticated;
set local request.jwt.claims = :B_CLAIMS;
select case when count(*) >= 1 then 'PASS' else 'FAIL' end || '  follower B sees it'
  from public.list_items where user_id = :A;
set local request.jwt.claims = :C_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  stranger C still cannot'
  from public.list_items where user_id = :A;
set local role anon; set local request.jwt.claims = '{"role":"anon"}';
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  anon cannot'
  from public.list_items where user_id = :A;

\echo ''
\echo '=== A private, selected people ==='
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
update public.profiles set watchlist_visibility = 'selected' where id = :A;
set local request.jwt.claims = :B_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  follower B not picked: cannot see it'
  from public.list_items where user_id = :A;
set local request.jwt.claims = :A_CLAIMS;
select case when count(*) = 1 and bool_and(is_follower) and not bool_or(selected) then 'PASS' else 'FAIL' end
       || '  A''s candidates include follower B, not yet picked'
  from public.list_watchlist_viewer_candidates() where id = :B;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  stranger C is not a candidate'
  from public.list_watchlist_viewer_candidates() where id = :C;
select public.share_watchlist_with(:B, true);
do $$ begin
  perform public.share_watchlist_with('6afcff23-4194-4724-af1b-08328ff81f48', true);
  raise notice 'FAIL  A picked stranger C';
exception when others then raise notice 'PASS  A cannot pick stranger C (%)', sqlerrm; end $$;
set local request.jwt.claims = :B_CLAIMS;
select case when count(*) >= 1 then 'PASS' else 'FAIL' end || '  picked follower B sees it'
  from public.list_items where user_id = :A;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  B cannot read A''s selected list'
  from public.watchlist_viewers where owner_id = :A;
do $$ begin
  insert into public.watchlist_viewers (owner_id, viewer_id)
    values ('467ce784-39eb-480e-8593-4632667fc9c3', 'e4e955fb-19f0-4e7d-b234-29c8eafa88fb');
  raise notice 'FAIL  B wrote to A''s selected list';
exception when others then raise notice 'PASS  B cannot write to A''s selected list (%)', sqlerrm; end $$;

\echo ''
\echo '=== Unfollowing prunes the pick ==='
reset role; set local request.jwt.claims = '{"role":"service_role"}';
delete from public.follows where follower_id = :B and following_id = :A;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  B''s pick is gone once B stops following'
  from public.watchlist_viewers where owner_id = :A and viewer_id = :B;
insert into public.follows (follower_id, following_id) values (:B, :A);
update public.follows set status = 'accepted' where follower_id = :B and following_id = :A;
set local role authenticated;
set local request.jwt.claims = :B_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  following again does not bring access back'
  from public.list_items where user_id = :A;

\echo ''
\echo '=== A public ==='
reset role; set local request.jwt.claims = '{"role":"service_role"}';
update public.profiles set is_public = true, watchlist_visibility = null where id = :A;
set local role anon; set local request.jwt.claims = '{"role":"anon"}';
select case when count(*) >= 1 then 'PASS' else 'FAIL' end || '  public, unset: anon sees it (unchanged from today)'
  from public.list_items where user_id = :A;
reset role; set local request.jwt.claims = '{"role":"service_role"}';
update public.profiles set watchlist_visibility = 'private' where id = :A;
set local role anon; set local request.jwt.claims = '{"role":"anon"}';
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  public, only me: anon cannot'
  from public.list_items where user_id = :A;
set local role authenticated; set local request.jwt.claims = :B_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  public, only me: follower B cannot'
  from public.list_items where user_id = :A;
reset role; set local request.jwt.claims = '{"role":"service_role"}';
update public.profiles set watchlist_visibility = 'everyone', is_public = false where id = :A;
set local role authenticated; set local request.jwt.claims = :B_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  "everyone" then going private: follower B cannot'
  from public.list_items where user_id = :A;

\echo ''
\echo '=== Legacy lists.is_public no longer opens it ==='
reset role; set local request.jwt.claims = '{"role":"service_role"}';
update public.lists set is_public = true where user_id = :A and name = 'My List';
set local role authenticated; set local request.jwt.claims = :C_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  stranger C cannot read items of a list flagged is_public'
  from public.list_items where user_id = :A;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  nor the list row'
  from public.lists where user_id = :A;

\echo ''
\echo '=== Nothing crosses a block ==='
reset role; set local request.jwt.claims = '{"role":"service_role"}';
update public.lists set is_public = false where user_id = :A and name = 'My List';
update public.profiles set is_public = true, watchlist_visibility = 'followers' where id = :A;
insert into public.user_blocks (blocker_id, blocked_id) values (:A, :B);
set local role authenticated; set local request.jwt.claims = :B_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  blocked B cannot see it'
  from public.list_items where user_id = :A;

rollback;
\echo ''
\echo 'rolled back'
