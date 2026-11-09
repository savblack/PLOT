# Newsletter admission at the edge

This private Worker lets the website reject repeated newsletter signup attempts
before invoking Supabase. It does not use a WAF rule slot. SQLite-backed Durable
Objects are available on Workers Free, subject to Cloudflare's usage limits.

One object per hashed client IP admits five POST attempts in a rolling minute.
The sixth starts a ten-minute block. Repeated blocked attempts do not extend the
block. Stored timestamps survive eviction; an alarm clears expired state. Neither
raw addresses nor newsletter email/body values are stored or logged here.

The website forwards Cloudflare's `CF-Connecting-IP` through a service binding.
The Worker has no public route, workers.dev endpoint, or preview URL. GET/HEAD
unsubscribe links, POST one-click unsubscribe requests, and OPTIONS requests keep
their existing upstream behavior.
POST fails closed with 503 if the binding, client address, or limiter is unavailable.
The existing Supabase per-IP/global limits remain the backstop, including for
requests made directly to the Supabase endpoint.

## Rollout, only after approval

1. Deploy `plot-newsletter-limit` from this folder's `wrangler.jsonc`. Its migration
   creates a new SQLite Durable Object namespace, not a Supabase migration.
2. In the `plot-site` Pages project's production and preview settings, add service
   binding `NEWSLETTER_EDGE_LIMITER` to Worker `plot-newsletter-limit`.
3. Deploy the website change only after the binding exists. Merging the website
   handler without its binding makes signup POSTs return 503.
4. Verify a valid signup, excess-attempt 429 with `Retry-After`, GET unsubscribe
   links, and the backend invocation count. Use an approved test address/IP.

Keep the current SSR WAF rule unchanged. This is application admission at
Cloudflare, not a claim that the WAF rule exists or that Cloudflare requests
are free/unmetered.

Rollback the website handler first, then remove its service binding. Do not delete
the Worker/namespace while the website still requires it.

## Verification

From the repository root:

```sh
pnpm exec wrangler deploy --dry-run --config apps/web/workers/newsletter-limit/wrangler.jsonc
pnpm exec wrangler types /tmp/plot-newsletter-env.d.ts --config apps/web/workers/newsletter-limit/wrangler.jsonc
pnpm exec tsc --noEmit --allowJs --checkJs --skipLibCheck --target es2022 --module esnext --moduleResolution bundler apps/web/workers/newsletter-limit/src/index.js /tmp/plot-newsletter-env.d.ts
# In another terminal, start the local Worker first:
# pnpm exec wrangler dev --local --config apps/web/workers/newsletter-limit/wrangler.jsonc --port 8793
# PLOT_TEST_IP_SUFFIX chooses fresh documentation-only IPs for each probe run.
PLOT_TEST_IP_SUFFIX=180 node apps/web/workers/newsletter-limit/test/runtime-probe.mjs
node --test apps/web/workers/newsletter-limit/test/*.test.mjs apps/website/functions/_lib/newsletter-edge.test.js
pnpm run test:website
pnpm run test:workers
pnpm run check
```

The compatibility date is October 13, 2026, matching the runtime pinned by the
repository lockfile. No runtime dependency or lockfile change is needed.

References:
- [Durable Objects availability and pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Pages service bindings](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings)
- [Durable Object storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
