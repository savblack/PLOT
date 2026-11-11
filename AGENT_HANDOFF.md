# staging-suite-ci

Status: active. PR https://github.com/savblack/PLOT/pull/1550 open, waiting on Savannah; not merged
Branch: agent/2026-11-11-staging-suite-ci
Worktree: ~/Developer/PLOT-worktrees/2026-11-11-staging-suite-ci
Updated: 2026-11-11 (see the latest commit for the time)

## In plain words

Plot's 26 Staging database tests sign in as pretend users and check that the
privacy and security rules really hold. They only ran when someone remembered,
and when we tried them, 17 of 26 no longer worked at all. They now run with
one command, every night, and on every change to the database. 25 of 26 pass.
The last one has found a real bug: logged-out visitors can't see anyone's
public lists, because the database refuses them permission. That fix is a
separate, small database change that needs Savannah's OK.

## Goal

Replace the per-test `staging:*-test` scripts with one runner and run it in CI
(nightly plus PRs touching `supabase/migrations/`), raising an `incident` issue
on a nightly failure. Staging only.

Owner: Jacob's area (CI, reliability, security). Started by the automation-plan
session `local_e768aa0c-0f82-457d-aecd-d54ea4a12447`.

## Done (evidence)

- `scripts/staging-test.mjs`: `pnpm run staging:test -- <name ...|all|--list>`.
  Each test runs in one transaction: pending migrations (in the checkout, not in
  Staging's ledger), then `scripts/staging-test-fixtures.sql`, then the test, then
  rollback. It refuses a test containing COMMIT or one that `\i`s a migration.
- `.github/workflows/staging-tests.yml`: GitHub Actions (that's where
  `PLOT_STAGING_DB_PASSWORD` lives). Nightly 07:10 UTC, plus PRs touching
  migrations or the test files. A failure on main opens or comments on the
  `incident` issue titled "Staging SQL tests are failing"; the next pass closes it.
- 23 `staging:*-test` package.json scripts removed; `staging:session` kept.
- Tests repaired, without weakening any assertion:
  - removed migration replays (Staging has all 184 migrations; replays crashed or
    silently swapped in old function bodies);
  - fixture C (`6afcff23…`) had been deleted from Staging, so fixtures now recreate
    A/B/C inside the transaction; the block test reads usernames by id;
  - `can_view_watchlist` moved to `private` (20261012150000);
  - Linear mirror functions dropped (20261017120000);
  - sixth/seventh free list now refused by the cap trigger (P0001
    `custom_list_limit_reached`) before RLS: both refusals accepted;
  - watch-events counted every row in a live table: scoped to its own row
    (delete policy is owner-only; not a leak);
  - pgss-guard: Staging now has pg_cron, so it asserts the cron job;
  - visibility: Want to Watch default for a private profile is "only me" since
    20260927160000.
- Docs: AGENTS.md (Staging tests section), docs/guide/production-rollout.md,
  docs/premium/features-to-build.md. Dated "this passed" logs left as written.

## Checks

- `pnpm run staging:test -- all`: 25/26 pass. `visibility` stops on
  `permission denied for function is_custom_list_member` (real bug, below).
- Deliberate break (flipped a block-test assertion): runner exit 1, names `block`;
  restored: exit 0.
- Probe migration `20991231000000` + probe test: applied inside the test, then
  Staging had no function, no ledger row, no fixture C. Probe files deleted.
- Visibility with `grant execute … to anon` added inside the rollback: 33/33 pass,
  so that grant is the whole fault.
- `pnpm run check`: passes (0 errors; 175 pre-existing mobile warnings).
- CI on the PR: expected red until the anon bug is fixed (that is the job working).

## Real bug found (not fixed here; needs a migration, so needs Savannah's OK)

`anon` lacks EXECUTE on `private.is_custom_list_member(uuid)` and
`private.can_edit_shared_list(uuid)` (revoked in 20260927120000). The SELECT
policies on `user_custom_lists` and `user_custom_list_items` call it behind a
`current_user = 'authenticated'` guard, but Postgres checks EXECUTE on every
function in the expression before evaluating it. So any logged-out read of
those tables errors. `packages/core/usePublicProfile.js` reads them for a
logged-out profile visitor, gets an error, and shows no lists. Proven on
Staging; production assumed identical (db:drift compares grants) but not
queried. Fix: grant EXECUTE on those two to anon (they return false for anon),
or restructure the policies. A permission change, so a second agent should
read the diff before the PR opens.

## Next

1. Savannah: approve the PR (or ask for changes). Don't merge until the anon fix
   lands or she accepts the nightly incident staying open until then.
2. Follow-up session: the anon grant migration, verified with
   `pnpm run staging:test -- visibility` on its branch.
3. Delete this file in the last commit before merge.
