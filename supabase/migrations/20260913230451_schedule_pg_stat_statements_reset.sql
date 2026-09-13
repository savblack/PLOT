-- Weekly pg_stat_statements reset — the only thing consuming this project's
-- Disk IO Budget.
--
-- RE-ISSUED FROM 20260913040000 (#872), which merged but was never applied.
-- That version was stamped 04:00 from the clock and from the newest migration
-- on its own branch, but the branch predated 20260913090000 and
-- 20260913100000, both of which production had already applied. The Supabase
-- integration applies in version order and skips anything sorting before the
-- last applied version, so the file merged green and did nothing. The deploy
-- guard did not catch it either: the integration's check sits at
-- "Waiting for branch action run to complete" indefinitely, so the guard timed
-- out without a verdict and raised no alarm. Stamp migrations against what
-- PRODUCTION has applied, not against your branch.
--
-- The re-issue then collided: 20260913110000 was taken by
-- 20260913110000_for_you_retire_cross_user_tier.sql, written in a parallel
-- session and merged first, and two migrations sharing a version stops the
-- pipeline outright (npm run migrations:check). Hence the odd-looking exact
-- timestamp rather than a round hour: round hours are what collide when more
-- than one branch is in flight.
--
-- WHAT WAS ACTUALLY HAPPENING: Supabase warned on 2026-09-13 that PLOT
-- Production was depleting its Disk IO Budget. Nothing in this repo was
-- responsible. Measured against production:
--
--   pg_stat_io, 126 days since postmaster start
--     checkpointer       437 MB written
--     client backends     16 MB read, 10 MB extended
--     autovacuum       under 2 MB
--   pg_stat_database
--     temp_files        81,434
--     temp_bytes           173 GB
--
-- Temp-file spill was roughly 350x all other database IO combined, on a 23 MB
-- database with a 100% cache hit ratio that essentially never reads from disk.
--
-- A Supabase platform session scrapes pg_stat_statements about once a minute.
-- Once the view outgrew work_mem (2,184 kB on Micro), every scrape sorted the
-- whole thing and spilled ~2.2 MB. At 3,291 tracked statements / 1,378 kB of
-- query text that ran at 40-77 temp files/hour, 103-198 MB/hour, ~4.65 GB/day.
-- A manual reset took it to a measured zero: 0 temp files over 9.1 minutes and
-- 746 commits, where comparable pre-reset windows produced 9 files and 23 MB.
--
-- Note for anyone re-diagnosing this: Supabase's own sessions run
-- `set pg_stat_statements.track = none`, so the queries doing the spilling are
-- invisible in pg_stat_statements. Application SQL accounted for 122 MB of the
-- 173 GB. A gap between pg_stat_database.temp_bytes and the sum of per-statement
-- temp is expected here, not a measurement error.
--
-- WHY A SCHEDULED RESET AND NOT THE ALTERNATIVES:
--   * Bounding pg_stat_statements.max (5000 by default) is the cleaner fix and
--     needs no recurring job — but it is a platform config change plus a
--     restart, and whether Supabase exposes that setting was never confirmed.
--     Worth revisiting; nothing here is in its way.
--   * Raising work_mem would also stop the spill, but work_mem is per sort, not
--     per connection, on a 1 GB instance. Trading a bounded disk cost for an
--     unbounded memory one is the wrong direction.
--   * Upgrading the compute add-on (what the warning email suggests) buys RAM
--     and IO baseline for a database that fits in cache ten times over.
--
-- WHAT THIS COSTS: the dashboard's Query Performance page only ever shows the
-- last week. That is the entire downside.
--
-- WHY WEEKLY, AND WHY THIS SLOT: the view took 126 days to reach 3,291
-- statements (~26/day) and the spill threshold sits somewhere between 240 and
-- 3,291, so a week keeps it in the low hundreds with a wide margin. Sunday
-- 00:05 UTC is 25 minutes ahead of the marketing weekly batch
-- (20260912090000), so a full week of batch statements survives for debugging
-- instead of being cleared out from under a run in progress.

-- Already installed by 20260912090000. Repeated so this migration stands on its
-- own against a restored database (see docs/ops/db-restore.md). No `with schema`
-- on pg_cron: its control file pins schema = 'cron' and sets relocatable =
-- false, so naming a schema aborts.
create extension if not exists pg_cron;

do $do$
begin
  -- scripts/db-migration-test.sh applies pending migrations to a vanilla
  -- Postgres 17: it stubs Vault and pg_net and comments out the pg_cron
  -- extension statement, but there is no `cron` schema there, so scheduling
  -- anything fails for reasons that say nothing about this. 20260912090000
  -- never tripped over that only because it is already applied and therefore
  -- never pending. Skip in that environment, out loud — a silent skip would
  -- make the gate lie about what it tested.
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped scheduling pg-stat-statements-reset';
    return;
  end if;

  -- On Supabase the same guard shape as the webhook and mirror migrations, for
  -- the same reason: fail at deploy time rather than schedule a job that errors
  -- every Sunday into a log nobody reads.
  if to_regprocedure('extensions.pg_stat_statements_reset()') is null then
    raise exception
      'extensions.pg_stat_statements_reset() is missing — is pg_stat_statements still installed in the extensions schema?';
  end if;

  perform cron.unschedule('pg-stat-statements-reset')
    where exists (select 1 from cron.job where jobname = 'pg-stat-statements-reset');

  -- Schema-qualified deliberately. pg_cron runs this as `postgres` with a
  -- default search_path that does NOT include `extensions`, so a bare
  -- pg_stat_statements_reset() resolves to nothing and the job fails every week
  -- while the spill carries on.
  perform cron.schedule(
    'pg-stat-statements-reset',
    '5 0 * * 0',
    $cron$select extensions.pg_stat_statements_reset()$cron$
  );
end
$do$;
