# lighten-db-load

Status: active
Branch: agent/2026-11-10-lighten-db-load
Updated: 2026-11-10 (Claude Code)
Owner: Jacob (reliability)

## Plain English
Production's Supabase server is the Free plan's smallest (about 400 MB of memory, about 1.4 GB needed), so it spills memory to disk, and that uses up the daily disk allowance. This change makes background jobs do less when there is nothing to do. It lightens the load but cannot fix the shortfall. The real fix is Pro plus Micro compute ($25 a month), which Savannah decides.

## Change
`supabase/migrations/20261110120000_lighten_background_jobs.sql`
- send-push and push-receipts: skip the edge function when there is nothing to do. Production had 0 push tokens and 0 deliveries.
- import worker tick: check for work before reading Vault. The schedule stays at 5 minutes, because the tick advances large imports while the app is closed (caught in review).
- new daily `cron-history-cleanup`: keeps 7 days of cron.job_run_details.

## Evidence (production, read-only, 2026-11-10)
- Dashboard: total RAM 406 MB, swap 428 MB, committed 1.44 GB ("SEVERE"). DB size 56 MB, 99.96% cache hits.
- cron, last 3 days: import-worker 861 runs (avg 1.7s), send-push 287, push-receipts 287.

## Approvals
- Savannah asked to "action everything that lightens the load" (2026-11-10).
- Still needed: merge (applies to production automatically), a production restart, and an optional shared_buffers change.

## Checks
- migrations:check pass, db:block-clause pass
- db:function-diff / db:migration-test / db:drift: see PR

## Next
Open the PR. Do not merge without Savannah's yes. Delete this file before merge.
