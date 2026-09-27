-- Proof that Watch together's access rules hold under real auth.uid(), from
-- every side that could break them: the two partners, a third person who is
-- nobody's partner, an anonymous caller, and a blocked partner.
--
--   set -a; . .env; set +a
--   npm run staging:watch-together-test
--
-- WHY: db:migration-test proves the four migrations apply to a copy of
-- production, and the PR's local scenarios used stand-in tables. Neither runs
-- the real policies and security definer functions under a real auth.uid()
-- against the real schema. This does.
--
-- It applies 20260927100000 to 20260927140000 itself, inside the transaction,
-- so it works whatever Staging's migration ledger says, and the final rollback
-- removes the migrations, every fixture and the Premium row. Staging (and its
-- ledger) is unchanged whether it passes or dies.
--
-- A (Premium), B and C (Free) are the Staging fixtures used by
-- staging-block-test.sql. Title ids are borrowed from rows already on Staging
-- (they came from TMDB); never invent them.
\set ON_ERROR_STOP on
\set A '''467ce784-39eb-480e-8593-4632667fc9c3'''
\set B '''e4e955fb-19f0-4e7d-b234-29c8eafa88fb'''
\set C '''6afcff23-4194-4724-af1b-08328ff81f48'''
\set A_CLAIMS '''{"sub":"467ce784-39eb-480e-8593-4632667fc9c3","role":"authenticated"}'''
\set B_CLAIMS '''{"sub":"e4e955fb-19f0-4e7d-b234-29c8eafa88fb","role":"authenticated"}'''
\set C_CLAIMS '''{"sub":"6afcff23-4194-4724-af1b-08328ff81f48","role":"authenticated"}'''

begin;

-- Staging already ran an earlier copy of these migrations, so two functions
-- exist there in their final shape (20260927130000 adds a column to each).
-- Production has never had them. Drop both so phase 1 starts from where
-- production will; the rollback puts Staging's copies back.
drop function if exists public.list_watch_together();
drop function if exists public.suggest_watch_together();

\ir ../supabase/migrations/20260927100000_watch_together.sql
\ir ../supabase/migrations/20260927110000_watch_together_sessions.sql
\ir ../supabase/migrations/20260927120000_watch_together_shared_lists.sql
\ir ../supabase/migrations/20260927130000_watch_together_free.sql
\ir ../supabase/migrations/20260927140000_watch_together_visibility_and_stop.sql

-- ── fixtures (as postgres) ───────────────────────────────────────────────────
-- See staging-block-test.sql for why the claims must be valid even here.
set local request.jwt.claims = '{"role":"service_role"}';

select tmdb_id as t1, media_type as m1, title as n1 from public.history order by tmdb_id limit 1
\gset
select tmdb_id as t2, media_type as m2, title as n2 from public.history where tmdb_id <> :t1 order by tmdb_id limit 1
\gset
select tmdb_id as t3, media_type as m3, title as n3 from public.history where tmdb_id not in (:t1, :t2) order by tmdb_id limit 1
\gset
-- DO blocks can't read psql variables, so the ones they need go in settings.
select set_config('wt.t2', :'t2', true), set_config('wt.m2', :'m2', true),
       set_config('wt.t3', :'t3', true), set_config('wt.m3', :'m3', true) \g /dev/null

delete from public.watch_together where requester_id in (:A, :B, :C) or recipient_id in (:A, :B, :C);
delete from public.watch_together_closed where requester_id in (:A, :B, :C) or recipient_id in (:A, :B, :C);
delete from public.follows where follower_id in (:A, :B, :C) and following_id in (:A, :B, :C);
delete from public.user_blocks where blocker_id in (:A, :B, :C) and blocked_id in (:A, :B, :C);
update public.profiles set is_public = true, watch_together_requests_from = 'profile' where id in (:A, :B, :C);

-- A is Premium, B and C are Free.
delete from public.billing_customers where user_id in (:A, :B, :C);
insert into public.billing_customers (user_id, stripe_customer_id, subscription_status, current_period_end)
  values (:A, 'cus_wt_proof', 'active', now() + interval '30 days');

-- Watchlists ("My List"): t1 saved by A and B, t2 only by B, t3 by A and C.
insert into public.lists (user_id, name) values (:A, 'My List'), (:B, 'My List'), (:C, 'My List')
  on conflict (user_id, name) do nothing;
insert into public.list_items (list_id, user_id, tmdb_id, media_type, title)
  select l.id, l.user_id, x.t, x.m, x.n
    from public.lists l
    join (values (:A::uuid, :t1, :'m1', :'n1'), (:B::uuid, :t1, :'m1', :'n1'), (:B::uuid, :t2, :'m2', :'n2'),
                 (:A::uuid, :t3, :'m3', :'n3'), (:C::uuid, :t3, :'m3', :'n3')) as x(u, t, m, n)
      on l.user_id = x.u and l.name = 'My List'
  on conflict (list_id, tmdb_id) do nothing;
delete from public.list_items li using public.lists l
 where l.id = li.list_id and l.name = 'My List' and l.user_id = :A and li.tmdb_id = :t2;

\echo ''
\echo '=== Requests and pairing ==='
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
select case when public.send_watch_together_request(:B) = 'pending' then 'PASS' else 'FAIL' end || '  A sends B a request';

set local request.jwt.claims = :C_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  C cannot see the A-B request row'
  from public.watch_together where :A in (requester_id, recipient_id);
do $$ begin
  perform public.watch_together_titles(array['e4e955fb-19f0-4e7d-b234-29c8eafa88fb'::uuid]);
  raise notice 'FAIL  C (not a partner) read titles with B';
exception when others then raise notice 'PASS  C (not a partner) cannot read titles with B (%)', sqlerrm; end $$;

set local request.jwt.claims = :B_CLAIMS;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  B sees the incoming request'
  from public.list_watch_together() where other_id = :A and direction = 'incoming';
select public.respond_watch_together_request(:A, true);

set local request.jwt.claims = :A_CLAIMS;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  A and B are paired'
  from public.list_watch_together() where other_id = :B and direction = 'paired';
select case when bool_or(tmdb_id = :t1) and not bool_or(tmdb_id = :t2) then 'PASS' else 'FAIL' end
       || '  shared titles include what both saved, not what only B saved'
  from public.watch_together_titles(array[:B::uuid]);

\echo ''
\echo '=== Pairing does not widen table access ==='
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
update public.profiles set is_public = false where id = :B;
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || '  partner A cannot read private B''s watchlist rows directly'
  from public.list_items where user_id = :B;
select case when bool_or(tmdb_id = :t1) and not bool_or(tmdb_id = :t2) then 'PASS' else 'FAIL' end
       || '  B private: shared titles still show only what both saved'
  from public.watch_together_titles(array[:B::uuid]);
do $$ begin
  perform public.watchlist_keys('e4e955fb-19f0-4e7d-b234-29c8eafa88fb');
  raise notice 'FAIL  a signed-in caller read watchlist_keys';
exception when insufficient_privilege then raise notice 'PASS  watchlist_keys is not callable by signed-in users'; end $$;
do $$ begin
  perform public.watch_together_overlap_count('e4e955fb-19f0-4e7d-b234-29c8eafa88fb');
  raise notice 'FAIL  a signed-in caller read watch_together_overlap_count';
exception when insufficient_privilege then raise notice 'PASS  watch_together_overlap_count is not callable by signed-in users'; end $$;

set local request.jwt.claims = :C_CLAIMS;
do $$ begin
  perform public.send_watch_together_request('e4e955fb-19f0-4e7d-b234-29c8eafa88fb');
  raise notice 'FAIL  C requested private B without following';
exception when others then raise notice 'PASS  C cannot request private B without following (%)', sqlerrm; end $$;

reset role;
set local request.jwt.claims = '{"role":"service_role"}';
update public.profiles set watch_together_requests_from = 'none' where id = :C;
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
do $$ begin
  perform public.send_watch_together_request('6afcff23-4194-4724-af1b-08328ff81f48');
  raise notice 'FAIL  A requested C, who takes no requests';
exception when others then raise notice 'PASS  requests respect "no one" (%)', sqlerrm; end $$;
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
update public.profiles set watch_together_requests_from = 'profile' where id = :C;

\echo ''
\echo '=== Sessions ==='
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
select public.start_watch_together_session(:B) as sid
\gset
select set_config('wt.sid', :'sid', true) \g /dev/null
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  session rows are not readable directly'
  from public.watch_together_sessions;
select case when public.vote_watch_together(:'sid', :t1, :'m1', true) = false then 'PASS' else 'FAIL' end
       || '  A votes yes (no match yet)';

set local request.jwt.claims = :C_CLAIMS;
do $$ declare s uuid := current_setting('wt.sid')::uuid; begin
  perform public.get_watch_together_session(s);
  raise notice 'FAIL  C read A and B''s session';
exception when others then raise notice 'PASS  C cannot read A and B''s session (%)', sqlerrm; end $$;

set local request.jwt.claims = :B_CLAIMS;
select case when (s->'my_votes') = '[]'::jsonb and (s->>'other_answered')::int = 1 and (s->'matches') = '[]'::jsonb
            then 'PASS' else 'FAIL' end || '  B sees that A answered, but not how'
  from (select public.get_watch_together_session(:'sid') as s) x;
do $$ declare s uuid := current_setting('wt.sid')::uuid; begin
  perform public.vote_watch_together(s, current_setting('wt.t2')::int, current_setting('wt.m2'), true);
  raise notice 'FAIL  B voted on a card that is not in the deck';
exception when others then raise notice 'PASS  votes must be on a deck card (%)', sqlerrm; end $$;
select case when public.vote_watch_together(:'sid', :t1, :'m1', true) then 'PASS' else 'FAIL' end
       || '  B votes yes too: a match';

\echo ''
\echo '=== Shared lists ==='
do $$ begin
  perform public.create_shared_list('wt-proof', array['467ce784-39eb-480e-8593-4632667fc9c3'::uuid]);
  raise notice 'FAIL  Free B created a shared list';
exception when others then raise notice 'PASS  only Premium can create a shared list (%)', sqlerrm; end $$;

set local request.jwt.claims = :A_CLAIMS;
do $$ begin
  perform public.create_shared_list('wt-proof', array['6afcff23-4194-4724-af1b-08328ff81f48'::uuid]);
  raise notice 'FAIL  A added C, who is not a partner';
exception when others then raise notice 'PASS  only partners can be added (%)', sqlerrm; end $$;
select public.create_shared_list('wt-proof', array[:B::uuid], :B::uuid) as lid
\gset
select set_config('wt.lid', :'lid', true) \g /dev/null
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  the list starts with what both saved'
  from public.user_custom_list_items where list_id = :'lid' and tmdb_id = :t1;

set local request.jwt.claims = :B_CLAIMS;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  member B can read the list'
  from public.user_custom_lists where id = :'lid';
select public.add_shared_list_item(:'lid', :t2, :'m2', :'n2');
select case when user_id = :A and added_by = :B then 'PASS' else 'FAIL' end
       || '  a member''s title is owned by the list owner, added_by the member'
  from public.user_custom_list_items where list_id = :'lid' and tmdb_id = :t2;
do $$ declare l uuid := current_setting('wt.lid')::uuid; begin
  insert into public.user_custom_list_items (list_id, user_id, tmdb_id, media_type, title)
    values (l, 'e4e955fb-19f0-4e7d-b234-29c8eafa88fb', current_setting('wt.t3')::int, current_setting('wt.m3'), 'x');
  raise notice 'FAIL  member B wrote to the list directly';
exception when others then raise notice 'PASS  members cannot write list rows directly (%)', sqlerrm; end $$;
do $$ declare l uuid := current_setting('wt.lid')::uuid; n int; begin
  delete from public.user_custom_lists where id = l;
  get diagnostics n = row_count;
  raise notice '%  member B cannot delete the list', case when n = 0 then 'PASS' else 'FAIL' end;
end $$;
select case when count(*) = 2 then 'PASS' else 'FAIL' end || '  member B sees both people on the list'
  from public.list_shared_list_people(array[:'lid'::uuid]);
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  Saved by A too, for B'
  from public.watch_together_savers(:t1, :'m1') where id = :A;

set local request.jwt.claims = :C_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  outsider C cannot read the list'
  from public.user_custom_lists where id = :'lid';
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  outsider C cannot read its titles'
  from public.user_custom_list_items where list_id = :'lid';
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  outsider C cannot see who is on it'
  from public.list_shared_list_people(array[:'lid'::uuid]);
do $$ declare l uuid := current_setting('wt.lid')::uuid; begin
  perform public.add_shared_list_item(l, current_setting('wt.t3')::int, current_setting('wt.m3'), 'x');
  raise notice 'FAIL  outsider C added a title';
exception when others then raise notice 'PASS  outsider C cannot add a title (%)', sqlerrm; end $$;

\echo ''
\echo '=== Free pairs, and invite links ==='
set local request.jwt.claims = :C_CLAIMS;
select case when public.send_watch_together_request(:A) = 'pending' then 'PASS' else 'FAIL' end
       || '  Free C can send a request';
set local request.jwt.claims = :A_CLAIMS;
select public.end_watch_together(:C);
select public.my_watch_together_link() as k1
\gset
select set_config('wt.k1', :'k1', true) \g /dev/null

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  anon can see whose link it is'
  from public.watch_together_link_owner(:'k1') where id = :A;
do $$ begin
  perform public.list_watch_together();
  raise notice 'FAIL  anon listed pairings';
exception when insufficient_privilege then raise notice 'PASS  anon cannot list pairings'; end $$;

set local role authenticated;
set local request.jwt.claims = :C_CLAIMS;
select case when public.accept_watch_together_link(:'k1') = 'accepted' then 'PASS' else 'FAIL' end
       || '  C accepts A''s link and is paired';
set local request.jwt.claims = :A_CLAIMS;
select public.reset_watch_together_link() as k2
\gset
set local request.jwt.claims = :B_CLAIMS;
do $$ begin
  perform public.accept_watch_together_link(current_setting('wt.k1'));
  raise notice 'FAIL  a reset link still works';
exception when others then raise notice 'PASS  resetting retires the old link (%)', sqlerrm; end $$;

-- B and C are both Free: they can pair, but can't decide.
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
update public.profiles set is_public = true where id = :B;
set local role authenticated;
set local request.jwt.claims = :B_CLAIMS;
select public.send_watch_together_request(:C);
set local request.jwt.claims = :C_CLAIMS;
select public.respond_watch_together_request(:B, true);
do $$ begin
  perform public.watch_together_titles(array['e4e955fb-19f0-4e7d-b234-29c8eafa88fb'::uuid]);
  raise notice 'FAIL  two Free partners read shared titles';
exception when others then raise notice 'PASS  two Free partners need Premium to decide (%)', sqlerrm; end $$;

\echo ''
\echo '=== A blocks B: everything between them ends ==='
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
insert into public.user_blocks (blocker_id, blocked_id) values (:A, :B);
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  the A-B pairing is gone'
  from public.watch_together where (requester_id, recipient_id) in ((:A::uuid, :B::uuid), (:B::uuid, :A::uuid));
select case when status = 'ended' then 'PASS' else 'FAIL' end || '  their session ended'
  from public.watch_together_sessions where id = :'sid';
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  B is off A''s shared list'
  from public.user_custom_list_members where list_id = :'lid' and user_id = :B;

set local role authenticated;
set local request.jwt.claims = :B_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  blocked B cannot read the list'
  from public.user_custom_lists where id = :'lid';
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  blocked B gets no "Saved by A too"'
  from public.watch_together_savers(:t1, :'m1') where id = :A;
do $$ declare s uuid := current_setting('wt.sid')::uuid; begin
  perform public.get_watch_together_session(s);
  raise notice 'FAIL  blocked B reopened the session';
exception when others then raise notice 'PASS  blocked B cannot reopen the session (%)', sqlerrm; end $$;

set local request.jwt.claims = :A_CLAIMS;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || '  bystander pairing A-C is untouched'
  from public.list_watch_together() where other_id = :C and direction = 'paired';

\echo ''
\echo '=== Watchlist visibility agrees with the profile, and stopping leaves lists (20260927140000) ==='
-- 1. A partner who is also an accepted follower of a private profile can read
--    its watchlist through list_items (20260926090000), so Watch together must
--    say the same: can_see_full_watchlist is true for them even with "share my
--    full watchlist" off. Before 20260927140000 the two disagreed.
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
update public.profiles set is_public = false where id = :A;
insert into public.follows (follower_id, following_id) values (:C, :A);
update public.follows set status = 'accepted' where follower_id = :C and following_id = :A;
set local role authenticated;
set local request.jwt.claims = :C_CLAIMS;
select count(*) as c_rows from public.list_items where user_id = :A   -- not joined to lists: followers can't read that table
\gset
-- can_see_full_watchlist isn't callable by signed-in users, so ask it as the
-- owner while keeping C's claims (auth.uid() is still C).
reset role;
select case when :c_rows > 0 and public.can_see_full_watchlist(:A) then 'PASS' else 'FAIL' end
       || '  follower partner C: watchlist rows (' || :c_rows || ') and can_see_full_watchlist agree';
set local role authenticated;

-- 2. Stopping an accepted pairing takes each person off the other's shared
--    lists, as a block already did.
set local request.jwt.claims = :A_CLAIMS;
select public.create_shared_list('wt-proof-2', array[:C::uuid]) as lid2
\gset
select set_config('wt.lid2', :'lid2', true) \g /dev/null
select public.end_watch_together(:C);
set local request.jwt.claims = :C_CLAIMS;
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || '  after the pairing ends, C can no longer read the shared list'
  from public.user_custom_lists where id = :'lid2';
do $$ declare l uuid := current_setting('wt.lid2')::uuid; begin
  perform public.add_shared_list_item(l, current_setting('wt.t3')::int, current_setting('wt.m3'), 'x');
  raise notice 'FAIL  C edited the list after the pairing ended';
exception when others then raise notice 'PASS  C cannot edit it either (%)', sqlerrm; end $$;

rollback;
