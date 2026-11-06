# cron-schedules

Status: paused (PR open, waiting on Savannah's merge OK)
Owner: Jacob (reliability, deploys)
Branch: agent/2026-11-06-cron-schedules
Worktree: ~/Developer/PLOT-worktrees/2026-11-06-cron-schedules
Updated: 2026-11-07

## In plain words

Three background jobs were running on production at schedules someone set by
hand, different from what the code says. Savannah picked the schedules on
2026-11-07, and this change writes them into the code so production, Staging
and the repo agree: the Brevo email-list sync every 4 hours, the Notion review
sync every hour, and the import worker every 5 minutes. Merging changes
production's schedules, so it needs her OK.

## Done

- Migration `20261107120000_background_job_schedules.sql`: `cron.alter_job` on the three existing jobs, schedule only. Brevo `27 */4 * * *`, Notion mirror `41 * * * *`, import worker `*/5 * * * *`. :27 and :41 avoid other jobs' minutes.
- Found via `db:drift` while working on PR #1458 (see that branch's handoff). Production before this: Brevo `17 * * * *`, Notion `*/15 * * * *`, import `*/5 * * * *`.

## Checks

- Second-agent review (2026-11-07): `cron.alter_job` usage correct for pg_cron 1.6; no minute clashes; no test asserts old schedules. Noted that a 5-minute import worker makes large imports finish ~5x slower once the user leaves Home (each tick does <=45s, one job per tick). Production already runs `*/5`, so this does not change today's behaviour. Stale "every minute"/"every five minutes"/daily comments and docs updated (`packages/core/importJobs.js`, `supabase/functions/import-worker/index.ts`, `docs/ops/gtm-automations.md`).
- `pnpm run check` and `pnpm run edge:check` passed.

- `pnpm run migrations:check` passed (178 scanned).
- `pnpm run db:migration-test` passed (production copy, 177 applied, this one pending).
- Staging: applied in one transaction with its `schema_migrations` row. Schedules confirmed; every job's command and active flag unchanged (md5 before/after equal); 16 jobs before and after.

## Next

1. Merge order: PR #1458's migration is `20261106120000`, older than this one. Merge #1458 first, or rename that one again, so production never gets an older migration after a newer one.
2. On Savannah's merge OK: delete this file in the last commit, merge, then confirm production's three schedules with a read-only query.

## Approvals

- Given: the three schedules (2026-11-07).
- Still needed: merge (changes production job schedules).
