-- Weekly pg_stat_statements reset — the only thing consuming this project's
-- Disk IO Budget.
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
  --
  -- Look the function up by NAME, not by exact signature. to_regprocedure()
  -- matches an argument list exactly, and pg_stat_statements 1.11 declares
  --   pg_stat_statements_reset(oid, oid, bigint, boolean)
  -- with a default for all four arguments. So `extensions.pg_stat_statements_reset()`
  -- is perfectly callable (the defaults fill in), while
  -- to_regprocedure('extensions.pg_stat_statements_reset()') searches for a
  -- zero-argument overload that has never existed and returns NULL.
  --
  -- That is not hypothetical: this guard fired on a completely healthy
  -- production database. The extension was installed in `extensions` and the
  -- function was right there, and the migration still aborted. It then sat
  -- pending from 2026-09-13, turned every subsequent Supabase deploy red,
  -- held later migrations out of production, and — the real cost — meant the
  -- weekly reset this migration exists to schedule was never scheduled at all,
  -- so the temp-file spill documented above just carried on.
  --
  -- A name lookup is also what this guard actually wants to assert: that the
  -- extension is present in `extensions`. Checking pg_proc directly keeps that
  -- true across extension versions, which is exactly what moved underneath it.
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'extensions'
      and p.proname = 'pg_stat_statements_reset'
  ) then
    raise exception
      'extensions.pg_stat_statements_reset is missing — is pg_stat_statements still installed in the extensions schema?';
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
