# import-worker-saves

Status: paused
Branch: agent/2026-11-16-import-worker-saves
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-import-worker-saves
Updated: 2026-11-16 (stopped at usage limit, unfinished)

## In plain words

Background imports (IMDb, Letterboxd, any uploaded file) save nothing on
production. The files are read and matched, then every save is refused. The
fix is written but not yet tested against a database, and nothing is merged.

## Evidence

Savannah ran four sample files through production on the monitoring test
account (plot-signin-watch@example.invalid) on 2026-11-16: all four ended
status=partial, imported=0, failed=all rows. Test data was removed after.

## Cause

import_watch_events, import_saved_list and import_saved_annotations read the
account from auth.uid() and are granted to `authenticated` only. The
import-worker calls them as the service role, so every batch is refused.
Began when IMPORT_EVENTS_ENABLED went on in production on 2026-11-11. Staging
has it off, so no test saw it.

## Done (unverified against a database)

- supabase/migrations/20261116120000_import_worker_saves_as_user.sql: additive
  `<name>_as(p_user, ...)` functions, service role only, that run the existing
  functions for a named account. Nothing existing is redefined.
- packages/core/importRpc.js + importPipeline.js, importLists.js,
  importAnnotations.js, config.js (`importActsForUser`).
- supabase/functions/import-worker/index.ts sets importActsForUser: true.
- importEngine.generated.js regenerated.
- packages/core/tests/unit/importRpc.test.js: 3 pass.

## Next, in order

1. Write scripts/staging-import-worker-saves-test.sql (as service_role: the
   three _as functions save rows for fixture account A
   467ce784-39eb-480e-8593-4632667fc9c3; identity restored after; unknown
   account refused; authenticated and anon cannot execute any of the five new
   functions). Run `pnpm run staging:test -- import-worker-saves`.
2. Run migrations:check, migrations:contract, db:migration-test, db:drift,
   db:block-clause, test:unit, check, edge:check, full Playwright suite.
3. Check whether database.types.ts needs the new functions.
4. Have a different agent read the diff (migration + permission change).
5. Open the PR. Do not merge: the migration applies to production on merge.
6. After merge, rerun the production check script (must be rewritten; the
   scratchpad copy may be gone) and expect imported > 0 for all four files.

## Approvals

- Given: test imports on production with the monitoring account.
- Needed: Savannah's yes before merging (production migration).
