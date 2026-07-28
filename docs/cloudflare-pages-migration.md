# Migrating app.theplot.tv to Cloudflare Pages

The Vercel Hobby free tier paused production (on-the-fly OG rendering + crawler
SSR exhausted the CPU / origin-transfer caps). Instead of paying for Vercel Pro
we're moving the app to Cloudflare Pages — unlimited static bandwidth, no
full-site pause, and the wider Cloudflare platform (R2, KV, Durable Objects,
Queues). The marketing site (theplot.tv) has since moved to Cloudflare Pages too —
its Vercel `vercel.json` + `api/` are gone and it runs on `apps/website/functions/`.

## What's in the repo

- **`functions/`** (repo root) — the Vercel serverless functions ported to Cloudflare
  Pages Functions (`onRequest({ request, params, env })`), served at their real
  URLs (no rewrite layer needed). Cloudflare Pages discovers Functions in a
  `functions/` directory at the **project root directory** (which is the repo root,
  since the Pages build root is left blank) — NOT under `apps/web/`:
  - `u/[username].js` → `/u/<username>` (profile SSR) — port of `api/profile.js`
  - `list/[id].js` → `/list/<id>` (list SSR) — port of `api/list.js`
  - `save.js` → `/save` (title share SSR) — port of `api/save.js`
  - `sitemap-profiles.xml.js`, `sitemap-lists.xml.js` — port of the two sitemaps
  - `_lib/tmdb.js`, `_lib/og-base.js` — shared helpers (key/base come from `env`)
- **`apps/web/public/_headers`** — security headers (was `vercel.json` `headers`)
- **`apps/web/public/_redirects`** — SPA fallback `/* /index.html 200` (pre-existing)
- OG rendering stays on the standalone **`plot-og`** Worker (`apps/web/workers/og`).
- `_routes.json` is intentionally **not** committed — Pages auto-generates it from
  `functions/` (include `/u/*`, `/list/*`, `/save`, the two sitemaps; everything
  else static). A hand-written one would risk conflicting with the auto-generated.
- Vercel's `api/` + `vercel.json` are left untouched until cutover is verified
  (instant rollback), then deleted in the cleanup step.

## Prerequisite: OG Worker cut over (PR #263)

`plot-og` deployed to `workers.dev`, verified, and `OG_BASE_URL` /
`VITE_OG_BASE_URL` set to its URL. Pages has no `/api/og`, so OG_BASE_URL **must**
be set in the Pages project.

## Step 1 — create the Pages project (Git-connected)

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git →
   authorize `savblack/PLOT`, production branch `main`.
2. Build configuration:
   - **Root directory:** repo root (leave blank / `/`) — npm workspaces must
     install from root so `@plot/core` resolves; the root `.npmrc` supplies
     `legacy-peer-deps`.
   - **Build command:** `npm run build`
   - **Build output directory:** `apps/web/dist`
3. Environment variables (Production + Preview). Build-time `VITE_*`:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TMDB_PROXY_URL`,
   `VITE_TRAKT_CLIENT_ID`, `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN`,
   `VITE_PUBLIC_POSTHOG_HOST`, `VITE_OG_BASE_URL`, `VITE_TURNSTILE_SITE_KEY`,
   `VITE_SHOW_GOOGLE_LOGIN`, `VITE_AMZ_TAG_AU/US/GB`, `VITE_APPLE_AT_TOKEN`.
   Runtime (Functions): `OG_BASE_URL`, and `TMDB_API_KEY` (mark as a secret).
4. Deploy.

## Step 2 — verify on the `*.pages.dev` URL (before any DNS change)

- SPA loads; client-side routes work; hard-refresh a deep route (SPA fallback).
- `view-source` on `/u/<real-username>` and `/save?media_type=movie&tmdb_id=27205`
  shows the per-page `og:image` (the `plot-og` Worker URL), title, and JSON-LD.
- `/list/<public-list-id>` renders the poster wall.
- `/sitemap-profiles.xml` and `/sitemap-lists.xml` return XML.
- OG card images load (from the Worker).
- `curl -sI https://<project>.pages.dev/` shows the CSP + security headers.
- `curl -sI https://<project>.pages.dev/favicon.svg` is served static (no Function).

## Step 3 — DNS cutover

- Pages → Custom domains → add `app.theplot.tv` (DNS already in Cloudflare, so a
  CNAME flip). Re-run the Step 2 checks on the real host.
- Keep the Vercel project in place and unpaused as instant rollback (repoint DNS
  back if anything breaks).

## Step 4 — cleanup (after a few days stable) — DONE (repo side)

`app.theplot.tv` is served by Cloudflare (`server: cloudflare`, no `x-vercel-*`), so the
repo-side cleanup is complete:

- [x] Removed `@vercel/og` and `@vercel/analytics` from `apps/web/package.json`.
- [x] Deleted `apps/web/api/` and `apps/web/vercel.json`.
- [ ] **Manual (dashboard):** decommission the Vercel project for the app. Note: once this
  cleanup is merged to `main`, the Vercel Git deploy would rebuild from a source tree with no
  `vercel.json`/`api/`, so DNS-rollback-to-Vercel is no longer a viable fallback — rollback is
  now git revert + redeploy on Cloudflare. The marketing site (`apps/website`) stays on Vercel.

## Known risks

1. **Monorepo build:** if Pages doesn't pick up `functions/` with
   root-dir = repo root, fall back to a `wrangler.toml` with
   `pages_build_output_dir`, or relocate `functions/` to repo root. Validate on
   the first build. This file now lives at `apps/web/wrangler.toml` (moved
   2026-07-28) — a repo-root copy was getting auto-discovered by Cloudflare's
   "v2 root directory strategy" build config detection for the *other* Pages
   project (`plot-site`, theplot.tv), whose scoped root is `apps/website`, and
   broke its builds since the output path resolved outside that project's
   directory.
2. **OG CPU on Cloudflare free:** Satori rendering may exceed the free Workers
   per-request CPU limit; if so, `plot-og` needs Workers Paid ($5/mo).
3. **`_routes.json`:** confirm dynamic paths invoke Functions and a static asset
   does not (keeps you inside the 100k/day free Function budget).
