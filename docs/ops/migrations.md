# Migrations and the database

Moved out of `AGENTS.md`, which points here. Read this before writing or reviewing a migration.

## `create or replace function` replaces the WHOLE body

Recreating a function you didn't author means inheriting everything the previous version
fixed, and Postgres accepts a stale body silently. This has already caused a two-week
production outage: `20260718120000` widened `feed_posts`' unique key to include
`source_type` and updated the trigger's `ON CONFLICT` to match; `20260725000001` then
recreated the same function from the pre-widening body, pointing the upsert at a
constraint that no longer existed. Every write to `history` raised 42P10 and, because it
is an AFTER trigger in the same transaction, the user-facing write failed. Marking a title
watched was broken from 2026-07-25 to 2026-08-03 and nothing detected it.

So:

- **Before recreating an existing function, diff against what's live** — not against the
  migration you remember. `select pg_get_functiondef(oid) from pg_proc where proname = '…'`.
- `pnpm run migrations:check` fails the build if a redefinition changes the `ON CONFLICT`
  target. If the change is deliberate, add `-- redefines: <fn> (…why…)` to the migration.
  It also fails when a migration here uses a version that `origin/main` gave to a
  different file (checks run on the pull request's own head, so a number `main` took
  after you branched is otherwise invisible; Staging and production then skip your
  file with no error). Fix: rename yours to a version after `main`'s newest and merge
  `main` in. Locally, `git fetch origin main` first.
- **Expand, then contract.** `pnpm run migrations:contract` (CI) fails a new or changed
  migration that drops, renames or retypes a table, column, view, function, type or enum
  value while the code on `main` (`apps/`, `packages/`, `supabase/functions/`), a SQL
  function body or a cron job still names it. It also stops a new `not null` column with
  no default, or `set not null`, on an existing table. Add the new thing and move the code
  first; remove the old thing in a later migration, after that code has shipped (and, for
  anything mobile read, after old iPhone builds stop mattering). When you have done that,
  acknowledge each name: `-- contracts: <name> (why nothing deployed still uses it)`.
  A name mobile or `packages/core` used in the last 90 days counts as used, because
  installed iPhone builds lag `main`. It also fails a new function or cron job that names
  a column, table or function an earlier migration removed (the `20261004100000` outage);
  `-- dead-name-ok: <name> (what it is instead)` covers a same-named jsonb key or variable.
  See `docs/ops/migration-contract.md`.
- `pnpm run db:write-paths` checks the live database: every trigger function's upsert key
  must resolve against a real constraint, and every table it references must exist. Runs
  daily via `.github/workflows/db-write-paths.yml` and on any PR touching migrations.
  Read-only; it deliberately does not write-and-rollback, because `http_request` triggers
  on `profiles`/`feedback` are not reliably transactional.
- **A migration merged to `main` applies to PRODUCTION automatically** via the Supabase
  GitHub integration. There is no staging gate — write it as if it runs immediately.
- **Staging follows main.** `.github/workflows/staging-migrate.yml` runs
  `pnpm run staging:migrate` (`scripts/staging-apply-migrations.mjs`) on every push to
  `main` that touches `supabase/migrations/`. It applies each migration Staging has not
  recorded, in one transaction, and records it. Before this, nothing applied merged
  migrations to Staging, and the nightly drift check failed until someone did it by hand
  (16, 18 and 19 November 2026). It refuses, changing nothing, when Staging recorded one
  of main's versions under another name: a branch migration tried out on Staging that took
  the same number. To clear that, renumber the branch file to a free version, move
  Staging's row in the same transaction
  (`update supabase_migrations.schema_migrations set version = '<new>' where version = '<old>' and name = '<branch name>'`),
  then rerun the workflow from the Actions tab. `-- --dry-run` lists what it would apply.
- **`pnpm run db:migration-test` before merging anything under `supabase/migrations/`.**
  Both checks above are static — neither executes any SQL — so without this the first run
  of a migration is on real user data. This restores a copy of production into a throwaway
  local Postgres 17 cluster, applies whatever is pending, and exits non-zero if any of it
  fails. Needs `brew install postgresql@17` and the main checkout's `.env`. It caught two
  deliberately broken migrations (a bad column reference and a bad cast) in testing.
  Limits: Vault and pg_net are stubbed, and RLS policies are created but not exercised, so
  a policy's *correctness* still needs the Staging project.
- **`pnpm run db:function-diff` before merging any `create or replace function`.**
  A redefinition is a whole-body replacement: you do not amend a function, you retype it,
  and starting from the migration you remember rather than the body that is live silently
  reverts everything added since. `migrations:check` catches only the one detail that broke
  in July (a changed `ON CONFLICT` target). This catches the general case by restoring
  production, applying pending migrations, and printing a unified diff of every function
  body that changed. **A redefinition that only ADDS lines is the safe shape** — the tool
  counts removed lines for exactly that reason. Not a CI gate: it needs production
  credentials and its output is a diff for a human to read.
- **`pnpm run staging:test -- <name|all>`** runs the Staging SQL tests
  (`scripts/staging-<name>-test.sql`; `-- --list` names them). They execute policies, RPCs
  and triggers under a real `auth.uid()` on the Staging project, which no static check and
  not `db:migration-test` can do. `.github/workflows/staging-tests.yml` runs `all` nightly
  (a failure opens an `incident` issue; the next pass closes it) and on every PR touching
  `supabase/migrations/`. Each test runs in one transaction ending in `rollback`, so Staging
  is unchanged whether it passes or dies partway — a teardown block at the bottom of a
  script does not run when the script dies above it, which is how a previous run left a
  profile public and a block row behind. The runner (`scripts/staging-test.mjs`) first
  applies, inside that transaction, every migration in your checkout that Staging has not
  recorded, so a branch's migrations are checked by every test. **A test must never `\i` a
  migration itself:** replaying a shipped migration puts an older function body back inside
  the transaction and the test passes against code that is no longer live. That is how 17
  of 26 tests had silently stopped working by November 2026; the runner refuses such a
  file. Fixture accounts A/B/C come from `scripts/staging-test-fixtures.sql`, which
  recreates any Staging has lost. A new test is just a new `scripts/staging-<name>-test.sql`;
  `scripts/staging-sql.sh` is the shared connection wrapper and is hard-wired to Staging.
  The block test asserts from four viewpoints — blocker, blocked, an unrelated bystander,
  and an anonymous reader. The last two are not padding: they are the only thing that
  catches a visibility clause that is too *broad*.
- **A trigger or function that names a column is not checked when it is created.** plpgsql
  resolves `NEW.col`, `OLD.col` and column names in its SQL only when the line runs, so
  `migrations:check` and `db:migration-test` both pass. `20261004100000` set
  `watch_together.requester_shares_full`, which `20260927160000` had already dropped, and
  every mutual-follow acceptance then raised in production until `20261005100000`. Before
  relying on a column in a trigger or function, grep later migrations for
  `drop column` on it, and write a `staging:*-test` that runs the trigger's real path under
  an `auth.uid()`: its first line should reproduce the failure without the fix.
- **`pnpm run db:block-clause` (CI)** requires every function reading `profiles` to be in
  exactly one of `BLOCK_FILTERED` or `BLOCK_EXEMPT` in `scripts/check-block-clause.mjs`.
  Blocking hides identity through seven security definer RPCs, because `profiles` has one
  select policy (`auth.uid() = id`) and every identity read bypasses RLS. A later migration
  recreating one of them from a stale body would drop the `not_blocked` clause and *nothing
  would fail* — blocking keeps working everywhere else, the blocked account simply reappears
  on one surface. Adding an identity RPC without classifying it fails the build.
- **`pnpm run db:restore-drill`** proves the nightly backup still restores. `pg_restore`
  exits 0 even when tables fail, so run this after any migration adding an extension type,
  and compare the table count against production. See `docs/ops/db-restore.md`.
- **`pnpm run db:drift`** (nightly via `.github/workflows/migration-drift.yml`) compares
  production's and Staging's `schema_migrations` with `supabase/migrations`, then Staging's
  schema with production's. Read-only. It exists because Staging drifted 18 migrations
  behind `main` in September 2026 without anyone noticing, and because a ledger row is not
  proof: two branches shared version `20260926160000`, so Staging recorded main's
  `refresh_premium_badges` as applied and never ran it. Run it on your branch before merging
  a migration: a version already taken on Staging by another branch fails it. After
  applying or hand-repairing anything on Staging, record it in `schema_migrations` in the
  same transaction.

## `config.toml` pins `verify_jwt` per function

**Supabase `config.toml` pins `verify_jwt` per function.** Public functions set
`verify_jwt = false`; forgetting it on redeploy makes the gateway reject requests before the
function runs (this has taken `/whats-on` and Stripe billing down). Deploy relies on this
file, not the `--no-verify-jwt` flag.
