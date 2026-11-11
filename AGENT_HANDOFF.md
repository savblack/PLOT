# pgnet-health

Status: active
Owner: Jacob (CTO) lane, via Claude Code side session
Branch: agent/2026-11-11-pgnet-health
Worktree: ~/Developer/PLOT-worktrees/2026-11-11-pgnet-health
Updated: 2026-11-11T10:05Z

## Goal
Alert when a pg_cron job's (or DB webhook's) pg_net call to an edge function fails.

## Done
- Migration 20261111190000_pg_net_call_health.sql: log table + 2 triggers on pg_net tables + pg_net_call_health() for plot_ci_readonly + daily purge job.
- APPLIED ON STAGING (recorded in schema_migrations). The triggers cannot be dropped by postgres (needs supabase_admin); off switch = recreate both trigger functions as no-ops.
- scripts/lib/pgNetHealth.mjs + tests; check-cron-jobs.mjs --http; cron-health.yml `http` job.
- Staging test scripts/staging-pgnet-calls-test.sql passes (6 checks).

## Next
- Prove alert through a temporary push workflow (tmp-pgnet-proof.yml) against Staging; then delete that file, close the test issue.
- Docs, pnpm run check, db:migration-test, open PR. Do not merge: migration needs Savannah's yes.
