-- Proof that taste_overlap() gates on Premium and visibility under a real
-- auth.uid(), and never returns a private profile's watchlist signal.
--
--   set -a; . .env; set +a
--   npm run staging:taste-overlap-test
--
-- WHY: db:migration-test proves the SQL parses and db:block-clause proves the
-- not_blocked clause is present. Neither runs the RPC as a signed-in user, so
-- neither can tell whether a Free viewer is refused, whether a private profile
-- stays closed to someone it has not accepted, or whether an accepted follower
-- of a private profile is kept away from that profile's watchlist.
--
-- The migration is applied INSIDE the transaction (\ir below), so this proves
-- the branch's function without deploying it, and the rollback at the end
-- removes the function along with every fixture row.
--
-- Accounts are the same three Staging fixtures the block test uses:
--   A  the viewer, made Premium here
--   B  a second viewer, left on Free
--   C  the person being compared with
-- Their history uses titles already in Staging's history table, so every
-- tmdb_id here came from TMDB (never a guessed id).
\set ON_ERROR_STOP on
\set A '''467ce784-39eb-480e-8593-4632667fc9c3'''
\set B '''e4e955fb-19f0-4e7d-b234-29c8eafa88fb'''
\set C '''6afcff23-4194-4724-af1b-08328ff81f48'''
\set A_CLAIMS '''{"sub":"467ce784-39eb-480e-8593-4632667fc9c3","role":"authenticated"}'''
\set B_CLAIMS '''{"sub":"e4e955fb-19f0-4e7d-b234-29c8eafa88fb","role":"authenticated"}'''

begin;

-- Valid claims even as postgres; see the note in staging-block-test.sql about
-- protect_premium_flag() and pooled backends carrying ''.
set local request.jwt.claims = '{"role":"service_role"}';

\ir ../supabase/migrations/20260926090000_taste_overlap.sql

select username as c_name from public.profiles where id = :C
\gset

-- ── fixtures ─────────────────────────────────────────────────────────────────
update public.profiles set is_premium = true  where id = :A;
update public.profiles set is_premium = false where id = :B;
update public.profiles set is_public  = true  where id = :C;
delete from public.follows where (follower_id, following_id) in ((:A, :C), (:C, :A), (:B, :C));
delete from public.user_blocks where :A in (blocker_id, blocked_id) or :C in (blocker_id, blocked_id);
delete from public.history where user_id in (:A, :C);
delete from public.list_items where user_id in (:A, :C);

-- Three real titles from Staging's own history.
create temp table t_titles on commit drop as
  select tmdb_id, media_type, min(title) as title, row_number() over (order by tmdb_id, media_type) as n
    from public.history
   group by tmdb_id, media_type
   order by tmdb_id, media_type
   limit 3;
grant select on t_titles to authenticated;

select case when count(*) = 3 then 'PASS' else 'FAIL' end || '  Staging has three real titles to use'
  from t_titles;

-- A: title 1 rated 8, title 2 rated 4, title 3 rated 9.  C: title 1 rated 10, title 2 rated 7.
-- C's 10 is five stars, the top of the scale; history.rating was numeric(2,1)
-- until 20260925140000 and could not hold it.
insert into public.history (user_id, tmdb_id, media_type, title, rating, watched_at)
select :A::uuid, tmdb_id, media_type, title, 8::smallint, '2026-01-01'::timestamptz from t_titles where n = 1 union all
select :A::uuid, tmdb_id, media_type, title, 4::smallint, '2026-02-01'::timestamptz from t_titles where n = 2 union all
select :A::uuid, tmdb_id, media_type, title, 9::smallint, '2026-03-01'::timestamptz from t_titles where n = 3 union all
select :C::uuid, tmdb_id, media_type, title, 10::smallint, '2026-01-02'::timestamptz from t_titles where n = 1 union all
select :C::uuid, tmdb_id, media_type, title, 7::smallint, '2026-02-02'::timestamptz from t_titles where n = 2;

-- Both have title 1 on their watchlist; only A has title 2.
insert into public.lists (user_id, name, is_public)
select u, 'My List', false from (values (:A::uuid), (:C::uuid)) v(u)
on conflict (user_id, name) do nothing;
insert into public.list_items (list_id, user_id, tmdb_id, media_type, title, genre_ids, provider_ids)
select l.id, l.user_id, t.tmdb_id, t.media_type, t.title, '{}', '{}'
  from public.lists l join t_titles t on t.n = 1 or (t.n = 2 and l.user_id = :A)
 where l.user_id in (:A, :C) and l.name = 'My List';

-- Runs as whoever the current role is, and reports the error instead of
-- aborting the transaction.
create function pg_temp.overlap(u text) returns jsonb language plpgsql as $$
begin
  return public.taste_overlap(u);
exception when others then
  return jsonb_build_object('error', sqlerrm);
end $$;

\echo ''
\echo '=== C PUBLIC, viewer A (Premium) ==='
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;

select pg_temp.overlap(:'c_name') as r
\gset
select case when (:'r'::jsonb) ? 'mine' and (:'r'::jsonb->'target'->>'is_public')::boolean
            then 'PASS' else 'FAIL' end || '  A can compare with a public profile';
select case when jsonb_array_length(:'r'::jsonb->'mine') = 3 and jsonb_array_length(:'r'::jsonb->'theirs') = 2
            then 'PASS' else 'FAIL' end || '  both histories come back, one row per title';
select case when exists (
         select 1 from jsonb_array_elements(:'r'::jsonb->'mine') e
          join t_titles t on t.n = 1 and (e->>'tmdb_id')::int = t.tmdb_id and e->>'media_type' = t.media_type
         where (e->>'rating')::numeric = 8)
            then 'PASS' else 'FAIL' end || '  ratings come back on the stored 1-10 scale';
select case when exists (
         select 1 from jsonb_array_elements(:'r'::jsonb->'theirs') e
          join t_titles t on t.n = 1 and (e->>'tmdb_id')::int = t.tmdb_id and e->>'media_type' = t.media_type
         where (e->>'rating')::numeric = 10)
            then 'PASS' else 'FAIL' end || '  a five-star rating (10) is stored and returned';
select case when (:'r'::jsonb->>'shared_watchlist')::int = 1
            then 'PASS' else 'FAIL' end || '  public target: watchlist overlap is counted (1)';
select case when pg_temp.overlap(username)->>'error' = 'not_found'
            then 'PASS' else 'FAIL' end || '  comparing with yourself is refused'
  from public.profiles where id = :A;
select case when pg_temp.overlap('no-such-handle-zz')->>'error' = 'not_found'
            then 'PASS' else 'FAIL' end || '  an unknown handle is not_found';

\echo ''
\echo '=== C PRIVATE, A not following ==='
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
update public.profiles set is_public = false where id = :C;
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
select case when pg_temp.overlap(:'c_name')->>'error' = 'not_visible'
            then 'PASS' else 'FAIL' end || '  a private profile you do not follow is refused';

\echo ''
\echo '=== C PRIVATE, A an accepted follower ==='
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
-- set_follow_status() forces a follow of a private profile to 'pending' on
-- insert, whatever the client sends; approval is a separate update, as in
-- useFollowRequests.approve.
insert into public.follows (follower_id, following_id) values (:A, :C);
update public.follows set status = 'accepted' where follower_id = :A and following_id = :C;
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
select pg_temp.overlap(:'c_name') as r
\gset
select case when (:'r'::jsonb) ? 'theirs' and jsonb_array_length(:'r'::jsonb->'theirs') = 2
            then 'PASS' else 'FAIL' end || '  an accepted follower can compare history';
select case when (:'r'::jsonb) ? 'shared_watchlist' and jsonb_typeof(:'r'::jsonb->'shared_watchlist') = 'null'
            then 'PASS' else 'FAIL' end || '  private target: no watchlist signal, even for a follower';

\echo ''
\echo '=== Free viewer B, C public ==='
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
update public.profiles set is_public = true where id = :C;
set local role authenticated;
set local request.jwt.claims = :B_CLAIMS;
select case when pg_temp.overlap(:'c_name')->>'error' = 'premium_required'
            then 'PASS' else 'FAIL' end || '  a Free viewer is refused server-side';

\echo ''
\echo '=== C blocks A ==='
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
insert into public.user_blocks (blocker_id, blocked_id) values (:C, :A);
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
select case when pg_temp.overlap(:'c_name')->>'error' = 'not_found'
            then 'PASS' else 'FAIL' end || '  a block reads as not_found, same as a missing handle';

\echo ''
\echo '=== grants ==='
select case when has_function_privilege('authenticated', 'public.taste_overlap(text)', 'execute')
            then 'PASS' else 'FAIL' end || '  authenticated may call taste_overlap';
select case when not has_function_privilege('anon', 'public.taste_overlap(text)', 'execute')
            then 'PASS' else 'FAIL' end || '  anon may not call taste_overlap';
select case when not has_function_privilege('authenticated', 'public.taste_overlap_rows(uuid)', 'execute')
            then 'PASS' else 'FAIL' end || '  the per-user row helper is not callable directly';

rollback;
\echo 'rolled back'
