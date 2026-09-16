# Five custom lists: verification

16 September 2026. Implemented locally; not deployed.

Free accounts may create five custom lists. A sixth creation attempt on web or
mobile shows the shared PLOT Premium coming-soon message. Built-in lists do not
count. Existing lists remain readable/editable after a downgrade or above the cap;
existing Premium entitlements still allow unlimited lists. No checkout is offered
by this notice.

All creation surfaces use the shared copy: Lists, title details, and saving a
collection, on both platforms. Database cap failures are translated even when the
client's list count is stale. Mobile's create dialog now waits for success before
closing. The database trigger serializes concurrent inserts per owner.

## Checks

- `pnpm install --frozen-lockfile`: passed. The attempted npm install could not
  resolve this pnpm workspace's `@plot/core` package; no manifest or lockfile changed.
- `npm run check`: passed, zero lint errors, 191 existing warnings, web build passed.
- `npm run test:unit`: passed, 301 web tests and 538 core tests.
- `npm run typecheck --prefix apps/mobile`: passed.
- `node --test scripts/tests/customListCap.test.mjs`: passed against an isolated
  PostgreSQL instance with synthetic data. Exercises the fifth/sixth boundary,
  cross-owner RLS, editing/deleting, Premium/expiry, atomic bulk insert rejection,
  and two concurrent requests competing for the final slot.
- `npm run migrations:check` and `npm run db:block-clause`: passed.
- `npm run db:migration-test`: both pending migrations applied to a temporary
  production copy. Initial sandbox startup failed; rerun with local Postgres
  permissions passed. Used `SANDBOX_PORT=55439`, `SANDBOX_SOCK=/tmp/plot-list-cap`.
- `npm run db:function-diff`: reviewed. The only replaced function-body line is
  `< 3` to `< 5`; the serialization trigger function is new.
- Targeted ESLint on the new SQL test runner and Storybook stories: passed.
- `git diff --check`: passed.
- Browser, real MyListsView in Storybook: five-list gate, four-list creation form,
  successful submission, and stale-count server error all passed. Shared Storybook
  setup logs missing `tmdbProxyUrl` for unrelated genre requests; no live account
  was used. Native device interactions were not exercised.

The production-copy checks stub Vault/pg_net. The synthetic SQL proof exercises
RLS but stubs the Premium entitlement helper; existing entitlement tests remain
separate. This work does not claim a staging or live subscription test.

## Rollout

Apply the allowance and serialization migrations with the app release after
production approval. The allowance migration uses the same filename and body as
the concurrent Premium workstream, avoiding two differently named copies of the
same allowance change. Preserve that when combining branches.

Storybook cases: `FourCustomLists`, `FiveCustomLists`, and `StaleListCount` in
`apps/web/src/stories/MyListsView.stories.jsx`.
