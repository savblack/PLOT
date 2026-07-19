# plot-og Worker — share-link OG cards on Cloudflare

Renders the 1200×630 Open Graph cards for shared PLOT links (profile / list /
post / title). This is a port of `apps/web/api/og.js` off Vercel.

## Why this exists

On-the-fly Satori image rendering is the single heaviest CPU consumer in the
app. Under launch crawler + social-unfurl traffic it exhausted the Vercel Hobby
**Fluid Active CPU** and **Fast Origin Transfer** caps and paused production.
Cloudflare's free tier is far more generous for this workload, and the
`tmdb-proxy` Worker already proves the pattern. The card-render functions are
copied verbatim from `og.js`, so output is pixel-identical; only the runtime
plumbing differs (`workers-og` instead of `@vercel/og`, `env` instead of
`process.env`, fonts fetched from `FONT_BASE`).

## The cutover is env-gated (safe by default)

Merging this PR changes **nothing** in production. `apps/web/api/og.js` stays
deployed on Vercel and remains the default. The app only points at this Worker
once you set `OG_BASE_URL` / `VITE_OG_BASE_URL`. So the sequence is: deploy →
**verify visually** → flip the env → redeploy. Unset the env to roll back
instantly.

## Deploy

```sh
cd apps/web/workers/og
npm install
npx wrangler secret put TMDB_API_KEY   # paste the same value as the Vercel env
npx wrangler deploy
```

Requires a Cloudflare API token with **Workers Scripts: Edit** (the DNS-scoped
`CLOUDFLARE_API_TOKEN` in the repo `.env` is NOT sufficient), or `npx wrangler
login`.

## Verify BEFORE cutover

Open each variant on the `workers.dev` URL and confirm it matches the current
`app.theplot.tv/api/og` output (fonts, accent, layout):

- `https://plot-og.<subdomain>.workers.dev/?u=<a-real-username>`
- `https://plot-og.<subdomain>.workers.dev/?list=<a-public-list-uuid>`
- `https://plot-og.<subdomain>.workers.dev/?post=<a-public-post-uuid>`
- `https://plot-og.<subdomain>.workers.dev/?type=movie&id=27205`

Fonts are the most likely difference (they load from `FONT_BASE`). If text
renders in a fallback face, confirm `https://app.theplot.tv/fonts/DMSans-Regular.ttf`
is reachable and `FONT_BASE` is correct.

## Cutover

In Vercel project env (both the app functions and the Vite build read it):

```
OG_BASE_URL      = https://plot-og.<subdomain>.workers.dev
VITE_OG_BASE_URL = https://plot-og.<subdomain>.workers.dev
```

Redeploy the app. `og:image` tags on profile/list/title/post links now point at
the Worker. **Rollback:** delete both env vars and redeploy — links fall back to
`/api/og` on Vercel.

## Notes

- `ACCENT` is inlined (`#F06A88`) to keep the bundle self-contained; keep it in
  sync with `@plot/core` `colors.dark.accent`.
- The public Supabase anon key is the same one the browser ships — safe to embed.
