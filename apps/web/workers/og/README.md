# plot-og Worker — share-link OG cards (NOT DEPLOYED)

> **This Worker is not deployed, and nothing points at it.** The deployment was
> deleted on 2026-09-18. The source is kept because it is the only way back to
> branded share cards, and bringing it back is a deploy plus a secret — but
> **only on Workers Paid**. See "Why it is off" before changing anything here.

Renders the 1200×630 Open Graph cards for shared PLOT links (profile / list /
post / title) with Satori, via `workers-og`.

## Why it is off

A card render costs **~25ms of CPU**. The Workers **free** plan allows **10ms
per request**, so every render died with `Exceeded CPU Limit` and returned a 503
— for a while masked by the 7-day edge cache still serving older renders, which
is why nothing looked broken until someone checked a shared link by hand.

Two consequences worth knowing before reaching for an obvious fix:

- **"Render on miss, cache in R2" does not work on the free plan.** The miss
  render itself dies at 10ms, so the cache never populates. Pre-rendering would
  have to happen outside the Worker.
- **A CPU kill cannot be caught in-Worker.** It terminates the isolate, so no
  try/catch here can substitute a fallback card. That is why the choice moved to
  the callers, in `functions/_lib/og-card.js`.

Today `og:image` points at the title's TMDB backdrop (`functions/save.js`,
`supabase/functions/title-page`) or the static `apps/web/public/og-image.png`.
The trade: TMDB backdrops are sometimes key art rather than stills, so card
quality varies by title, and no share carries PLOT branding in the image.

## Bringing it back

1. Move the account to **Workers Paid** — the ceiling is the constraint, not the
   code, and none of this renders without it.
2. `cd apps/web/workers/og && pnpm install`
3. `npx wrangler secret put TMDB_API_KEY` (the deployment's secret went with it)
4. `npx wrangler deploy` — needs a token with **Workers Scripts: Edit** (the
   DNS-scoped `CLOUDFLARE_API_TOKEN` in the repo `.env` is NOT sufficient), or
   `npx wrangler login`.
5. Verify each variant on the `workers.dev` URL before pointing anything at it:
   `?u=<username>`, `?list=<uuid>`, `?post=<uuid>`, `?type=movie&id=27205`.
   Fonts are the likeliest problem — they load from `FONT_BASE`, so confirm
   `https://app.theplot.tv/fonts/DMSans-Regular.ttf` is reachable.
6. Point the callers back at it in `functions/_lib/og-card.js`. There is no env
   switch in source any more: `functions/_lib/og-base.js` was removed, and its
   fallback pointed at `/api/og` on Vercel, a path that stopped existing when
   the app moved to Cloudflare. If `OG_BASE_URL` still exists in the Pages
   project settings, it is inert and can be removed there separately.

## Notes

- The fonts are memoized per isolate (`fontsPromise`); a load yielding no usable
  font is deliberately not memoized, so a transient origin failure costs one
  request rather than the life of the isolate.
- `ACCENT` is inlined (`#F06A88`) to keep the bundle self-contained; keep it in
  sync with `@plot/core` `colors.dark.accent`.
- The public Supabase anon key is the same one the browser ships — safe to embed.
