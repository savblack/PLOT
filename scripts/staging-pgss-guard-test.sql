-- Regression test for the guard in
-- supabase/migrations/20260913230451_schedule_pg_stat_statements_reset.sql,
-- run against a real Supabase project.
--
-- History: the guard originally tested
-- to_regprocedure('extensions.pg_stat_statements_reset()'), which matches an
-- exact argument-type list. pg_stat_statements 1.11 declares the function as
-- (oid, oid, bigint, boolean) with all four defaulted and no zero-argument
-- overload, so it returned null on a healthy database and aborted the deploy.
-- The Supabase integration stops at the first failing migration, so that one
-- file blocked every migration on main for a day (#872, fixed in #881). This
-- keeps the old predicate around as a live counter-example so the fix cannot
-- be quietly undone.
--
--   set -a; . .env; set +a
--   npm run staging:pgss-guard-test
--
-- WHY STAGING AND NOT db:migration-test: the migration's own first branch skips
-- everything when there is no `cron` schema, which is exactly the case in the
-- throwaway Postgres 17 sandbox. So the sandbox can never exercise this guard,
-- and it reported PASS on a migration that fails on every real deploy. Only a
-- project with pg_cron and pg_stat_statements actually installed can tell you
-- anything here.
--
-- The `REPRO` line is the point: it evaluates the OLD predicate against
-- Staging's real catalog. A run reporting `no repro` means Staging's
-- pg_stat_statements does expose a zero-argument overload, and the comparison
-- below is no longer meaningful against THIS project — production's signature
-- is what the migration has to survive, and it was verified there directly.
--
-- Everything is in one transaction ending in rollback. Note that Staging has no
-- pg_cron, so the scheduling half of the migration is explicitly NOT covered
-- here and says so in its own output rather than passing quietly.
\set ON_ERROR_STOP on
begin;

\echo ''
\echo '=== environment: what Staging actually has ==='
select '---  extension ' || extname || ' in ' || extnamespace::regnamespace || ' v' || extversion
from pg_extension where extname in ('pg_stat_statements', 'pg_cron') order by extname;
select '---  signature ' || p.oid::regprocedure
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'extensions' and p.proname = 'pg_stat_statements_reset';

\echo ''
\echo '=== the predicate that broke production (must still REPRO) ==='
do $$
begin
  if to_regprocedure('extensions.pg_stat_statements_reset()') is null then
    raise notice 'REPRO     the old guard sees no function and would abort the deploy';
  else
    raise notice 'no repro  a zero-argument overload exists here, unlike production';
  end if;
end $$;

\echo ''
\echo '=== the predicate the migration ships today (must PASS) ==='
do $$
declare found boolean;
begin
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'extensions' and p.proname = 'pg_stat_statements_reset'
  ) into found;
  if found then
    raise notice 'PASS      the fixed guard finds the function and lets the deploy through';
  else
    raise notice 'FAIL      the fixed guard still cannot see it';
  end if;
end $$;

\echo ''
\echo '=== the command the weekly job will actually run ==='
-- Schema-qualified exactly as cron.schedule stores it. This proves the string
-- pg_cron executes resolves, which is the failure the migration warns about.
-- Not transactional (it clears a shared-memory hash), but this is Staging and
-- the only casualty is Staging query statistics.
do $$
begin
  perform extensions.pg_stat_statements_reset();
  raise notice 'PASS      `select extensions.pg_stat_statements_reset()` executes as written';
exception when others then
  raise notice 'FAIL      the scheduled command errors: %', sqlerrm;
end $$;

\echo ''
\echo '=== end-to-end scheduling: NOT provable here ==='
\echo '---  Staging has no pg_cron, so cron.schedule() is unproven until production.'
\echo '---  The Postgres 17 sandbox skips it for the same reason. What IS proven'
\echo '---  above is the predicate, which is what broke. The scheduling half was'
\echo '---  proven on PRODUCTION on 2026-09-14 instead: a throwaway job running'
\echo '---  the same command fired at 03:10:00 UTC, status=succeeded, and dropped'
\echo '---  pg_stat_statements from 524 rows to 27. Repeat that with a job two'
\echo '---  minutes out if the scheduled command ever changes.'
-- Stated with \echo so it survives the wrapper's line filter: a notice that gets
-- grepped away is precisely the silent skip the migration under test warns about.
-- The assertion below then stops that text going stale — the day Staging grows a
-- cron schema, this run turns red until someone extends the test.
do $$
begin
  if to_regnamespace('cron') is not null then
    raise notice 'FAIL      Staging now has pg_cron: extend this test to assert cron.schedule()';
  end if;
end $$;

rollback;
\echo 'rolled back — Staging unchanged'
