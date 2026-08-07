# PLOT

PLOT is a private React/Vite app for discovering and logging movies and TV shows. Public profile sharing is deferred from the first public release while account-visibility rules are still being designed. It uses Supabase for auth, storage, database access, and edge functions, TMDB for media metadata, and PostHog for product analytics.

## Stack

- React 19 and React Router
- Vite
- Supabase client and edge functions
- PostHog
- Cloudflare Pages deployment (web app and marketing site)

## Monorepo layout

This repo is an npm-workspaces monorepo. `npm ci` at the root installs every workspace. The root `package.json` is the workspace root and the orchestrator CI calls (`lint`, `build`, `test:*`, `tokens:*`, `mkt:*`); `build`/`dev`/`preview`/`test:*` delegate into `@plot/web`.

- **`apps/web/`** (`@plot/web`) — the Vite/React app (`src/`, `index.html`), deployed to Cloudflare Pages (build output `apps/web/dist`; SSR routes are Pages Functions in the repo-root `functions/`).
- **`apps/website/`** — the static marketing site (theplot.tv), its own Cloudflare Pages project (Root Directory `apps/website`); SSR routes are Pages Functions in `apps/website/functions/`. No build step.
- **`apps/mobile/`** (`@plot/mobile`) — the Expo / React Native app. Platform seams (storage, Supabase client options) are injected into `@plot/core` via `configure()` at startup; see `apps/mobile/lib/configureCore.ts`.
- **`packages/core/`** (`@plot/core`) — platform-agnostic logic (data hooks, Supabase/TMDB access, tokens, date/calendar helpers) shared by web and mobile. Both apps import it directly (e.g. `import { useWatchlist } from '@plot/core/useWatchlist.js'`), so there is one source of truth — no copy to drift.
- **`marketing/`**, **`supabase/`**, **`scripts/`** — marketing automation, Supabase backend (functions + migrations), and repo tooling. These stay at the root and run from there.

## Local Setup

1. Install dependencies:

   ```sh
   npm ci
   ```

2. Create a local env file:

   ```sh
   cp .env.example .env
   ```

3. Fill in the browser-safe `VITE_*` values in `.env`. Keep service-role and TMDB API keys server-side or local-script-only.

   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` ship in `.env.example` already pointed at PLOT Staging, PLOT's preview Supabase project — local dev has no backend of its own, so it borrows a real project, and Staging keeps that off real user data. Don't repoint these at Production for routine dev.

   `VITE_AUTH_REDIRECT_BASE_URL` is optional for local web development. Set it when auth and provider callbacks must use a stable production URL or a native deep-link base.

4. Start the app:

   ```sh
   npm run dev
   ```

## Staging

`localhost:5177` and `https://preview.theplot.tv` use the separate PLOT Staging
Supabase project. Their accounts and data never overlap with Production.

Use the guarded command for any routine staging backend work. It always targets
PLOT Staging and refuses a user-supplied project reference:

```sh
npm run supabase:staging -- functions deploy tmdb-proxy
npm run supabase:staging -- secrets list
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
npm run staging:session
```

For the hosted preview instead:

```sh
npm run staging:session -- --origin https://preview.theplot.tv
```

The command refuses non-staging Supabase configuration and writes a token-bearing
file under `.playwright/` with owner-only permissions. An agent can use that session
for browser tests, but must never print, commit, upload, or share the file.

## Scripts

- `npm run dev` starts Vite locally.
- `npm run build` creates a production build.
- `npm run lint` runs ESLint.
- `npm run check` runs lint and build together.
- `npm run test:smoke` builds the app and runs Playwright route smoke tests.
  Run `npx playwright install chromium` once first on a fresh machine if the Chromium test browser is not installed yet.
- `npm run preview` serves the production build locally.

## Supabase Functions

The frontend expects `VITE_TMDB_PROXY_URL` to point at the deployed `tmdb-proxy` function. The proxy keeps the TMDB API key out of the browser and only allows the TMDB endpoints used by the app.

Deploy functions with the Supabase CLI after configuring project secrets:

```sh
supabase functions deploy tmdb-proxy
supabase functions deploy media-sync
supabase functions deploy delete-account
supabase functions deploy critic-score
```

Required function secrets:

- `TMDB_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PLEX_TOKEN_SECRET` for encrypting Plex auth tokens at rest
- `OMDB_API_KEY` for the `critic-score` function's Rotten Tomatoes lookups (already used by the marketing scripts — same key, needs setting separately for Supabase via `supabase secrets set OMDB_API_KEY=...`)

## Plex Sync

Plot syncs Plex through the `media-sync` Edge Function. Users connect from Journal → Watchlist → Connect Plex, sign in on Plex, and return to Plot. Plex tokens are encrypted server-side and are never shown in the browser.

```sh
supabase secrets set PLEX_TOKEN_SECRET=your-long-random-secret
supabase db push
supabase functions deploy media-sync
```

The sync imports Plex Universal Watchlist titles into Plot, queues Plot Watchlist additions back to Plex, and imports watched history when a reachable Plex Media Server is available.

## Data Rules

Never hardcode TMDB movie or TV IDs. Resolve titles through TMDB search at runtime and only reuse IDs returned by TMDB API responses.

## GitHub Hygiene

Pull requests should pass CI before merging. The repository is private, so required branch protection may depend on the GitHub plan; keep CI, Dependabot, and security alerts enabled as the practical guardrails.

## Launch Docs

- Public launch playbook: [docs/launch/public-launch-readiness.md](docs/launch/public-launch-readiness.md)
- Signed-in QA checklist: [docs/qa/public-launch-checklist.md](docs/qa/public-launch-checklist.md)
- Shared design system: [docs/design/shared-design-system.md](docs/design/shared-design-system.md)
