# PLOT Staging: what it is and where it is wired

PLOT Staging is the second Supabase project (ref `uzrhfivnhdcfieuaxzip`). Local dev and the
per-branch Cloudflare previews run against it, so routine work never touches real user data.
There is no stable staging hostname: `preview.theplot.tv` was retired on 2026-09-06.

Read this before changing, renaming or removing anything staging-related. Each line below
is a place that breaks if Staging moves or goes away.

## Backend: the Supabase project

- `scripts/supabase-staging.mjs` (`pnpm run supabase:staging -- …`): runs a Supabase CLI
  command pinned to Staging. Use it for functions and secrets. The repo's default Supabase
  link is Production.
- `scripts/staging-sql.sh`: the psql wrapper every Staging SQL test uses. Hard-wired to Staging.
- `apps/web/workers/tmdb-proxy/wrangler.toml` `[env.staging]`: the `tmdb-proxy-staging`
  Worker that local dev and previews call for TMDB data.

## Tests that run against Staging

- `scripts/staging-test.mjs` (`pnpm run staging:test -- <name|all>`) runs
  `scripts/staging-<name>-test.sql` (31 files) with fixtures from
  `scripts/staging-test-fixtures.sql`. Rules for writing them: `docs/ops/migrations.md`.
- `scripts/staging-import-e2e.mjs` (`pnpm run staging:import-e2e`): uploads real export
  files and checks the import worker saves them.
- `scripts/create-staging-test-session.mjs` (`pnpm run staging:session`): a local
  Playwright login for the dedicated staging account (credentials in macOS Keychain).

## CI workflows

- `.github/workflows/staging-tests.yml`: Staging SQL tests nightly and on migration PRs.
- `.github/workflows/staging-import-e2e.yml`: nightly import end-to-end.
- `.github/workflows/migration-drift.yml`: compares Staging's and production's migrations.
- `.github/workflows/staging-migrate.yml`: applies main's migrations to Staging on merge
  (`pnpm run staging:migrate`).
- `.github/workflows/workers-deploy.yml`: deploys `tmdb-proxy` and its staging env together.

## App code that tells a preview from production

- `packages/core/captchaGate.js` (`isPreviewHostname`): the one list of non-production
  hosts (`*.plot-5wr.pages.dev`, localhost). Turnstile is not enforced on Staging.
- `apps/web/src/utils/previewDeployment.js`: web helper built on that list.
- `functions/_middleware.js`: noindex and preview CSP for every non-production host.
- `apps/web/src/pages/AuthPage.jsx`: turns Turnstile off on those hosts
  (`VITE_TURNSTILE_ON_PREVIEW=1` keeps it on for testing).

## Config and secrets

- Local web: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TMDB_PROXY_URL` in the
  repo-root `.env` (README "Local Setup").
- Local mobile: `apps/mobile/.env.example`.
- Cloud agents: `docs/ops/cloud-agent-environment.md` has the Staging URL and Worker URL.
- Keys are `sb_publishable_*`; legacy anon JWTs are off. See `docs/ops/supabase-key-rotation.md`.

## Docs that assume Staging exists

`README.md` ("Local Setup", "Staging"), `docs/ops/migrations.md`,
`docs/ops/migration-recovery.md`, `docs/ops/supabase-key-rotation.md`,
`docs/ops/db-restore.md`, `docs/ops/monitoring.md`, `docs/ops/background-imports.md`,
`docs/launch/app-store-launch-sprint.md`, `docs/billing/`, and the QA scripts
under `docs/qa/`. Find the rest with `grep -rli staging docs`.
