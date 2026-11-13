# cf-request-limit

Status: paused
Branch: agent/2026-11-13-cf-request-limit
Worktree: ~/Developer/PLOT-worktrees/2026-11-13-cf-request-limit
Owner: Jacob (reliability). Done by Claude Code.
Updated: 2026-11-13

## In plain words

Cloudflare emailed that Plot used up its free 100,000 server requests for the day on 2026-11-11. Every page load on app.theplot.tv and theplot.tv was running a small piece of server code, mostly to add a security header. This change sends only the pages that really need server code through it. Everything else is served as a plain file, with the same security header coming from Cloudflare's static settings file. Savannah needs to approve opening and merging the pull request. Nothing is live yet.

## Done (checkpoint, not yet a PR)

- `apps/web/public/_routes.json`: only the 8 real Function routes run code (was everything except images and fonts).
- `apps/web/public/_headers`: generated per-host CSP block (production, preview pages.dev hosts with staging and noindex).
- `scripts/build-app-headers.mjs`: writes that block from `CSP`/`PREVIEW_CSP` in `functions/_middleware.js`; `--check` is in `pnpm run lint`.
- `apps/website/_routes.json`: only Function routes plus the middleware-only paths (`/`, `/robots.txt`, `/ig`, `/x`, `/th`, `/plans`, `/whats-on/`).
- `apps/website/_headers`: noindex for `admin.theplot.tv/*`, which now serves static pages on paths other than the ones above, instead of the 410 response.
- `scripts/check-pages-routes.mjs`: lint fails if a file under either `functions/` folder is not reachable through its `_routes.json`.

## Verified

- `pnpm run check`: pass. `pnpm run csp:check`: pass. `pnpm run test:unit`: pass. `node --test apps/website/functions/_lib/*.test.js`: 83/83 pass.
- Guard negative test: removing `/og` from the app routes makes `check-pages-routes.mjs` exit 1.
- `wrangler pages dev apps/web/dist`: `/home` on Host app.theplot.tv has the production CSP; on `*.plot.pages.dev` the preview CSP and noindex; on localhost no CSP (proves the middleware did not run). `/u/x` and `/og` still run their Functions.

## Next

1. Get Savannah's OK, then open the PR (remove this file in the last commit first).
2. After the Cloudflare preview deploys, check the response headers on a preview URL and on a profile page (`/u/<name>`).
3. After merge, watch Workers & Pages usage in the Cloudflare dashboard for a day.

## Not covered (follow-ups)

- TMDB proxy Worker: each TMDB lookup is one request; the app's cache is memory-only (`packages/core/tmdb.js`). Probably the largest share, not measured.
- The proxy's `caches.default` is a no-op on a `workers.dev` host, so every lookup reaches TMDB.
- The marketing homepage `/` still runs code for the markdown-for-agents response.
- Per-Worker usage numbers were not read: reading wrangler's saved login was blocked.

## Approvals

- Given: Savannah said "Yes, do it here" to the routing change (2026-11-13).
- Still needed: open PR, merge.
