# watching-last-activity

Status: active
Branch: agent/2026-11-10-watching-last-activity
Worktree: ~/Developer/PLOT-worktrees/2026-11-10-watching-last-activity
Owner: Jacob (CTO) lane; started by a side session of the Watching-order work (#1453)
Updated: 2026-11-11

## In plain words

Visitors to someone's public profile now see that person's Watching shows in the
same "last watched" order the owner sees. The database keeps a new "last activity"
time on each show, moved by History logs, title-page episode ticks and imports.
Nothing has been applied to production; it applies only when the PR is merged,
and merging needs Savannah's yes.

## Done

- Migration `supabase/migrations/20261111100000_watching_progress_last_activity.sql`
  (column, triggers, backfill, redefines `update_watching_progress_updated_at`).
- Staging proof `scripts/staging-watching-last-activity-test.sql`
  (`pnpm run staging:watching-last-activity-test`): 14/14 PASS, rolled back.
- Core: `watchingActivity.js` reads the column; `usePublicProfile.js` uses
  `readLatestWatching`; `useWatching.js` drops the three-table read.
- Unit tests in `packages/core/tests/unit/watchingOrder.test.js`.
- Checks: `pnpm run check` OK, `pnpm run test:unit` OK, `migrations:check` OK,
  `db:block-clause` OK, `db:drift` OK (only the new migration, expected).

## Next

- Results of `db:migration-test` and `db:function-diff` go in the PR body.
- Draft PR open; do not merge without Savannah.

## Approvals

- Needed: merge (applies the migration to production automatically).
