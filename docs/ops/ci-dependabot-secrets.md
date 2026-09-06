# CI: Dependabot PRs need their own secrets

## Symptom

Every Dependabot PR fails CI at the **Smoke tests** step (Playwright reports
`element(s) not found`, blank auth/landing routes, non-empty `pageErrors`) even
though the same code passes CI on `push` to `main`. Lint, build, and typecheck
pass; only the runtime smoke tests fail. Because `dependabot-automerge.yml` only
merges green PRs, nothing auto-merges and Dependabot PRs pile up.

## Cause

GitHub deliberately does **not** pass repository **Actions** secrets to workflow
runs triggered by Dependabot. Those runs only see secrets stored separately under
**Settings → Secrets and variables → Dependabot**. Our CI build injects
`VITE_*` env vars at build time; without them the app builds with empty Supabase
config and renders nothing, so the Playwright smoke tests find no elements.

## Fix

Mirror the build-time `VITE_*` secrets into the **Dependabot** secrets scope
(same values as the Actions scope). These five are all the web build/smoke tests
need — server-only secrets (service role, R2, etc.) are not required:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_TMDB_PROXY_URL`
- `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN`
- `VITE_PUBLIC_POSTHOG_HOST`

```sh
gh secret set VITE_SUPABASE_URL --app dependabot --repo savblack/PLOT
# ...repeat for each; paste the same value used on the Actions side
```

Or via the UI: **Settings → Secrets and variables → Dependabot → New repository
secret** (the *Dependabot* sub-tab, not Actions).

If CI adds a new build-time `VITE_*` secret in future, add it to the Dependabot
scope too or Dependabot PRs will start failing again.

## What does NOT go in the Dependabot scope

`SUPABASE_DB_URL`, deliberately. Do not mirror it, even though its absence makes
a check fail exactly the way the smoke tests did.

The five secrets above are publishable anon keys — the browser ships them to
every visitor, so a Dependabot run holding them costs nothing. `SUPABASE_DB_URL`
is a full production database credential on the session pooler. A Dependabot run
exists to install new third-party package versions, and `npm ci` executes those
packages' install scripts; that is the last place that credential should be
readable.

The check it was failing, **DB write paths**, is skipped on Dependabot PRs
instead (see the `if:` on the job in `.github/workflows/db-write-paths.yml`).
Nothing is lost: the check reads trigger definitions and constraints out of the
database, and a lockfile bump cannot change either. It still runs on the daily
schedule and on every human PR.

Apply the same test to any future secret: if it is public anyway, mirroring is
fine; if it grants real access, skip the job instead.
