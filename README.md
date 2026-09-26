# PLOT

PLOT is a private React/Vite app for discovering and logging movies and TV shows. Public profile sharing is deferred from the first public release while account-visibility rules are still being designed. It uses Supabase for auth, storage, database access, and edge functions, TMDB for media metadata, and PostHog for product analytics.

## Stack

- React 19 and React Router
- Vite
- Supabase client and edge functions
- PostHog
- Cloudflare Pages deployment (web app and marketing site)

## Monorepo layout

This repo is a pnpm-workspaces monorepo. `pnpm install --frozen-lockfile` at the root installs every workspace. The root `package.json` is the workspace root and the orchestrator CI calls (`lint`, `build`, `test:*`, `tokens:*`, `mkt:*`); `build`/`dev`/`preview`/`test:*` delegate into `@plot/web`.

- **`apps/web/`** (`@plot/web`) — the Vite/React app (`src/`, `index.html`), deployed to Cloudflare Pages (build output `apps/web/dist`; SSR routes are Pages Functions in the repo-root `functions/`).
- **`apps/website/`** — the static marketing site (theplot.tv), its own Cloudflare Pages project (Root Directory `apps/website`); SSR routes are Pages Functions in `apps/website/functions/`. No build step.
- **`apps/mobile/`** (`@plot/mobile`) — the Expo / React Native app. Platform seams (storage, Supabase client options) are injected into `@plot/core` via `configure()` at startup; see `apps/mobile/lib/configureCore.ts`.
- **`packages/core/`** (`@plot/core`) — platform-agnostic logic (data hooks, Supabase/TMDB access, tokens, date/calendar helpers) shared by web and mobile. Both apps import it directly (e.g. `import { useWatchlist } from '@plot/core/useWatchlist.js'`), so there is one source of truth — no copy to drift.
- **`marketing/`**, **`supabase/`**, **`scripts/`** — marketing automation, Supabase backend (functions + migrations), and repo tooling. These stay at the root and run from there.

## Local Setup

1. Install dependencies:

   ```sh
   pnpm install --frozen-lockfile
   ```

2. Create a `.env` at the repo root. Vite reads the repo-root `.env` (see `envDir` in `apps/web/vite.config.js`), so it lives at the root, not under `apps/web`. Add the browser-safe `VITE_*` values:

   ```sh
   VITE_SUPABASE_URL=<PLOT Staging project URL>
   VITE_SUPABASE_ANON_KEY=<PLOT Staging publishable/anon key>
   VITE_TMDB_PROXY_URL=<staging tmdb-proxy Worker URL>
   VITE_SHOW_APPLE_LOGIN=<optional; set false to temporarily hide Apple sign-in>
   VITE_TRAKT_CLIENT_ID=<Trakt OAuth app client ID>
   ```

3. These values are browser-safe (they ship in the app bundle). `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` belong to PLOT Staging, PLOT's preview Supabase project (local dev has no backend of its own, so it borrows a real project, and Staging keeps that off real user data). Pull them from the Supabase dashboard, project `PLOT Staging`. Don't repoint these at Production for routine dev. Keep service-role and TMDB API keys server-side or local-script-only.

   `VITE_TMDB_PROXY_URL` must point at the staging tmdb-proxy Cloudflare Worker (`https://tmdb-proxy-staging.<subdomain>.workers.dev`), not the Supabase edge function directly: the Worker adds a shared-secret header the browser cannot set. See `apps/web/workers/tmdb-proxy/wrangler.toml`.

   `VITE_AUTH_REDIRECT_BASE_URL` is optional for local web development. Set it when auth and provider callbacks must use a stable production URL or a native deep-link base.

4. Start the app:

   ```sh
   pnpm run dev
   ```

## Staging

`localhost:5177` uses the separate PLOT Staging Supabase project, as do the
per-branch Cloudflare preview deployments (`https://<hash>.plot-5wr.pages.dev`,
linked from every PR). Their accounts and data never overlap with Production.

There is no longer a stable staging hostname. `preview.theplot.tv` was retired on
2026-09-06: the long-lived `preview` branch behind it had been deleted weeks
earlier, so it served a frozen August build, and per-branch previews already
covered what it was for. It was also the only publicly reachable non-production
deployment — the per-branch ones sit behind Cloudflare Access.

Use the guarded command for any routine staging backend work. It always targets
PLOT Staging and refuses a user-supplied project reference:

```sh
pnpm run supabase:staging -- functions deploy tmdb-proxy
pnpm run supabase:staging -- secrets list
```

The wrapper covers Supabase Functions, Secrets, and project configuration. Database
commands require an explicit staging database connection and are intentionally not
wrapped. Do not use an unqualified `supabase db push` or `supabase functions deploy`
for staging: the repository's default Supabase configuration is intentionally linked
to Production for production releases.

### Agent-ready staging login

Keep the dedicated staging account credentials in macOS Keychain, not in a prompt,
`.env`, or the repository. In **Keychain Access**, create two Password items named
`com.theplot.staging.test.email` and `com.theplot.staging.test.password` with the
account's email and password respectively.

Create an ignored Playwright session for local testing with:

```sh
pnpm run staging:session
```

`--origin` accepts local origins only. A per-branch preview is behind Cloudflare
Access, which a Playwright session can't pass without an Access service token.

The command refuses non-staging Supabase configuration and writes a token-bearing
file under `.playwright/` with owner-only permissions. An agent can use that session
for browser tests, but must never print, commit, upload, or share the file.

## Scripts

- `pnpm run dev` starts Vite locally.
- `pnpm run build` creates a production build.
- `pnpm run lint` runs ESLint.
- `pnpm run check` runs lint and build together.
- `pnpm run test:smoke` builds the app and runs Playwright route smoke tests.
  Run `npx playwright install chromium` once first on a fresh machine if the Chromium test browser is not installed yet.
- `pnpm run preview` serves the production build locally.

## Supabase Functions

The frontend expects `VITE_TMDB_PROXY_URL` to point at the deployed `tmdb-proxy` function. The proxy keeps the TMDB API key out of the browser and only allows the TMDB endpoints used by the app.

Deploy functions with the Supabase CLI after configuring project secrets:

```sh
supabase functions deploy tmdb-proxy
supabase functions deploy media-sync
supabase functions deploy trakt-sync
supabase functions deploy delete-account
supabase functions deploy critic-score
```

Required function secrets:

- `TMDB_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PLEX_TOKEN_SECRET` for encrypting Plex auth tokens at rest
- `TRAKT_CLIENT_ID` and `TRAKT_CLIENT_SECRET` for the Trakt OAuth app
- `TRAKT_TOKEN_SECRET` for encrypting Trakt auth tokens at rest
- `OMDB_API_KEY` for the `critic-score` function's Rotten Tomatoes lookups (already used by the marketing scripts — same key, needs setting separately for Supabase via `supabase secrets set OMDB_API_KEY=...`)

## Plex and Trakt imports

One-off watch-history imports from Plex and Trakt are Free. Ongoing two-way sync remains a separate Premium capability and is hidden until it is ready to launch. Plex tokens are handled by `media-sync`; Trakt OAuth tokens are handled by `trakt-sync`. Both are encrypted server-side and are never shown in the browser.

```sh
supabase secrets set PLEX_TOKEN_SECRET=your-long-random-secret
supabase secrets set TRAKT_CLIENT_ID=... TRAKT_CLIENT_SECRET=... TRAKT_TOKEN_SECRET=...
supabase db push
supabase functions deploy media-sync
supabase functions deploy trakt-sync
```

Plex history import requires at least one reachable Plex Media Server. Trakt history import uses the connected Trakt account. Both imports preserve existing Plot entries and add only titles that are not already in the user's history.

## Data Rules

Never hardcode TMDB movie or TV IDs. Resolve titles through TMDB search at runtime and only reuse IDs returned by TMDB API responses.

## GitHub Hygiene

Pull requests should pass CI before merging. The repository is private, so required branch protection may depend on the GitHub plan; keep CI, Dependabot, and security alerts enabled as the practical guardrails.

## Launch Docs

- Signed-in QA checklist: [docs/qa/public-launch-checklist.md](docs/qa/public-launch-checklist.md)
- Shared design system: [docs/design/shared-design-system.md](docs/design/shared-design-system.md)
