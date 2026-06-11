# PLOT

PLOT is a private React/Vite app for discovering, logging, and sharing movies and TV shows. It uses Supabase for auth, storage, database access, and edge functions, TMDB for media metadata, and PostHog for product analytics.

## Stack

- React 19 and React Router
- Vite
- Supabase client and edge functions
- PostHog
- Vercel deployment

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

   `VITE_AUTH_REDIRECT_BASE_URL` is optional for local web development. Set it when auth and provider callbacks must use a stable production URL or a native deep-link base.

4. Start the app:

   ```sh
   npm run dev
   ```

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
supabase functions deploy generate-taste-profile
supabase functions deploy generate-journal
supabase functions deploy delete-account
```

Required function secrets:

- `TMDB_API_KEY`
- `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`, depending on the function
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PLEX_TOKEN_SECRET` for encrypting Plex auth tokens at rest

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
