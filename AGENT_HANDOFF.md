# pgnet-health

Status: active
Owner: Jacob (CTO) lane, via Claude Code side session
Branch: agent/2026-11-11-pgnet-health
Worktree: ~/Developer/PLOT-worktrees/2026-11-11-pgnet-health
Updated: 2026-11-11T10:30Z

## Goal
Alert when a pg_cron job's (or DB webhook's) pg_net call to an edge function fails.

## Done
- Migration 20261111190000_pg_net_call_health.sql: log table + 2 triggers on pg_net tables + pg_net_call_health() for plot_ci_readonly + daily purge job.
- APPLIED ON STAGING (recorded in schema_migrations). The triggers cannot be dropped by postgres (needs supabase_admin); off switch = recreate both trigger functions as no-ops.
- scripts/lib/pgNetHealth.mjs + tests; check-cron-jobs.mjs --http; cron-health.yml `http` job.
- Staging test scripts/staging-pgnet-calls-test.sql passes (6 checks).

## Proof
- Staging: deliberate call to a missing function answered 404; check reported it.
- GitHub run 42999759727 (temporary workflow, now deleted) opened issue #1586 and sent the email; #1586 closed by hand.
- pnpm run check, test:unit, migrations:check, db:block-clause, db:migration-test, staging:test pgnet-calls: all pass.
- Second-agent review: no blockers; on-and-off rule and bulk-write note added from it.

## Next
- PR open. Needs Savannah's yes to merge (migration goes to production). After merge, run "pg_cron health (hourly)" once by hand and expect the http job green.
- If the PR is dropped: Staging keeps the triggers (postgres cannot drop them); recreate pg_net_calls_log_request/response as no-ops.
