# Cloud Agent environment

Moved out of `AGENTS.md`, which points here.

Repo-managed: `.cursor/environment.json` wins over any personal or team dashboard
environment for this repository. The Dockerfile pins Node **22.17.1** (same as
`.github/workflows/ci.yml`), Deno 2.9.5, pnpm 10.6.3, and PostgreSQL 17. `install` runs
`scripts/cloud-agent-install.sh` (frozen lockfile + Playwright Chromium).
`start` rewrites the repo-root `.env` from injected secrets so both Vite and
`node --env-file=.env` scripts see the same values. The web dev server is the
`web` terminal on port 5177.

Inject these as Cloud Agent **secrets** (never commit them). Browser-safe
`VITE_*` values belong to **PLOT Staging**, not Production:

| Secret | Why |
| --- | --- |
| `VITE_SUPABASE_URL` | Staging project URL (`https://uzrhfivnhdcfieuaxzip.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Staging publishable key (`sb_publishable_…`) |
| `VITE_TMDB_PROXY_URL` | `https://tmdb-proxy-staging.sav-black.workers.dev` |
| `VITE_TURNSTILE_SITE_KEY` | Needed for captcha-enforced signup/login. Same value as `EXPO_PUBLIC_TURNSTILE_SITE_KEY`. |

Optional, only if the agent must run marketing or migration-test scripts:

| Secret | Why |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging service role. Never the Production service role. |
| `SUPABASE_DB_URL` / `PLOT_PRODUCTION_DB_PASSWORD` | `pnpm run db:migration-test` restores a **copy of Production**. Confirm before injecting; the sandbox is destroyed on exit and holds real PII while it runs. |

`pnpm run test:smoke` and `pnpm run test-storybook:web` need the Playwright
Chromium the install script places in `~/.cache/ms-playwright`. `pnpm run
edge:check` needs Deno (on PATH in the image). `pnpm run db:migration-test`
needs the PG17 binaries (also in the image) plus the optional DB secret above.
