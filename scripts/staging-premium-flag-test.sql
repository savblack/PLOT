-- Reproduce the protect_premium_flag() crash, then prove the new body fixes it.
--
--   set -a; . .env; set +a
--   npm run staging:premium-flag-test
--
-- The `REPRO` line is the point: it runs the assertion against whatever body is
-- LIVE on Staging first, so a run that reports `no repro` is telling you the fix
-- has already been applied there and the before/after is no longer meaningful.
--
-- Everything is in one transaction ending in rollback — including the `create or
-- replace` — so Staging keeps the body it had whether this passes or dies.
-- See supabase/migrations/20260913100000_premium_flag_empty_claims.sql for why
-- an empty string ends up in request.jwt.claims in the first place.
\set ON_ERROR_STOP on
\set A '''467ce784-39eb-480e-8593-4632667fc9c3'''
begin;

\echo ''
\echo '=== BEFORE: the function as it is live ==='
set local request.jwt.claims = '';
do $$
begin
  update public.profiles set display_name = display_name where id = '467ce784-39eb-480e-8593-4632667fc9c3';
  raise notice 'no repro  an empty-claims update succeeded against the OLD body';
exception when others then
  raise notice 'REPRO     empty claims break every profile write: %', sqlerrm;
end $$;

\echo ''
\echo '=== applying the new body ==='
\i supabase/migrations/20260913100000_premium_flag_empty_claims.sql

\echo ''
\echo '=== AFTER ==='
set local request.jwt.claims = '';
do $$
begin
  update public.profiles set display_name = display_name where id = '467ce784-39eb-480e-8593-4632667fc9c3';
  raise notice 'PASS  empty claims no longer break a profile write';
exception when others then
  raise notice 'FAIL  still broken: %', sqlerrm;
end $$;

-- And the protection it exists for must still hold.
set local request.jwt.claims = '{"sub":"467ce784-39eb-480e-8593-4632667fc9c3","role":"authenticated"}';
do $$
begin
  update public.profiles set is_premium = not is_premium where id = '467ce784-39eb-480e-8593-4632667fc9c3';
  raise notice 'FAIL  a client just granted themselves premium';
exception when others then
  raise notice 'PASS  a client still cannot change is_premium (%)', sqlerrm;
end $$;

do $$
begin
  update public.profiles set is_supporter = not is_supporter where id = '467ce784-39eb-480e-8593-4632667fc9c3';
  raise notice 'FAIL  a client just granted themselves supporter';
exception when others then
  raise notice 'PASS  a client still cannot change is_supporter (%)', sqlerrm;
end $$;

do $$
begin
  update public.profiles set display_name = 'renamed by the client' where id = '467ce784-39eb-480e-8593-4632667fc9c3';
  raise notice 'PASS  a client can still change an ordinary column';
exception when others then
  raise notice 'FAIL  a client can no longer edit their own profile: %', sqlerrm;
end $$;

set local request.jwt.claims = '{"role":"service_role"}';
do $$
begin
  update public.profiles set is_premium = not is_premium where id = '467ce784-39eb-480e-8593-4632667fc9c3';
  raise notice 'PASS  the service role can still change is_premium';
exception when others then
  raise notice 'FAIL  the service role can no longer change is_premium: %', sqlerrm;
end $$;

-- Non-empty and unparseable must fail CLOSED, not open.
set local request.jwt.claims = 'not json at all';
do $$
begin
  update public.profiles set is_premium = not is_premium where id = '467ce784-39eb-480e-8593-4632667fc9c3';
  raise notice 'FAIL  garbage claims granted premium (failed open)';
exception when others then
  raise notice 'PASS  garbage claims fail closed (%)', sqlerrm;
end $$;

rollback;
\echo ''
\echo 'rolled back — Staging is exactly as it was'
