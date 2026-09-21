# apps/website

The theplot.tv marketing site: static HTML pages, deployed as-is (no build step). Stays that way intentionally.

## Local development

```
pnpm run dev:website
```

Serves the site on port 5202 through `wrangler pages dev`, so the Pages Functions in `functions/` run alongside the static pages — the same as production.

**Don't serve this directory with a plain static file server** (`python3 -m http.server`, `npx serve`, and friends). The pages render, but every `functions/` route 404s, and the front-end swallows those failures silently: the homepage's TMDB-fed surfaces (the What's On poster wall, the desktop side posters, the hero filmstrip, the guide-demo cards) all call `/api/discover`, and each one is wrapped in a bare `.catch()` that leaves it empty rather than showing an error. An empty poster wall locally is almost always this, not a broken proxy.

Running `wrangler pages dev .` from this directory by hand works too — two notes on why:

- The compatibility date is pinned in `wrangler.jsonc`, because `wrangler pages dev` otherwise defaults to *today's* date, which a slightly older `workerd` binary refuses to start on (`requires compatibility date "…", but the newest date supported by this server binary is "…"`). Pinning a past date is always safe; the runtime keeps supporting old dates. That file is local-dev-only and must stay that way: adding `pages_build_output_dir` to it would make it the source of truth for the whole Pages project and cut the dashboard configuration out of deploys. The file says so as well.
- It runs from `apps/website` because both that config and the Pages Functions are discovered relative to the working directory. From the repo root, wrangler misses the pin and picks up the *web app's* root `functions/` instead, so this site's routes 404 — which looks identical to the static-server failure above.

The repo `.env` is not loaded, so functions needing secrets (e.g. `/api/newsletter`) won't work locally. `/api/discover` needs none: it forwards to the public TMDB proxy Worker with the site's own public anon key. It does require evidence that the call came from a PLOT page, so a browser on localhost works and a bare `curl` gets a 403 (add `-H 'Sec-Fetch-Site: same-origin'` to test it by hand). See below.

## The public API catalog

`/.well-known/api-catalog` is an RFC 9727 catalog: a machine-readable list of the
endpoints this site serves to anyone, so an agent can find them without scraping
the pages. It names `api/openapi.json` (the description), `api/docs.md` (the
prose) and `/api/health` (liveness), all of which are here in this directory or
in `functions/`.

Three things keep it honest, and all three are easy to break by hand:

- Content type. The catalog URI has no extension, so Pages serves it as
  `application/octet-stream` unless `_headers` says otherwise, and RFC 9727
  clients require `application/linkset+json`. The `_headers` rules for it,
  `api/openapi.json` and `api/docs.md` are not optional decoration.
- Truth. The catalog is static JSON; nothing at runtime notices when it names a
  URL this site does not serve. `functions/_lib/api-catalog.test.js` (run by
  `npm run test:website`, which CI runs) checks every anchor and every link
  against what is actually on disk or in `functions/`, and checks the `_headers`
  rules still match the types the catalog advertises.
- Scope. The catalog describes what PLOT offers publicly, and the three
  `llms.txt`-style statements about that (`llms.txt` here, `apps/web/public/llms.txt`,
  and the homepage markdown in `functions/_lib/markdown.js`) have to keep
  agreeing with it. Adding an endpoint to the catalog means editing those too.

## What /api/discover is guarded by

This function holds the upstream credentials, so without a guard it is a TMDB
proxy anyone can spend PLOT's quota through: no key needed, from anywhere. Two
things stop that, and they are worth different amounts.

- **An allowlist and an edge cache** (`functions/api/discover.js`,
  `functions/_lib/discover.js`). Only the seven TMDB paths the homepage asks for
  are forwarded, only the four query parameters it sends survive, and only the
  exact values it sends for them. What is left is sorted into a canonical cache
  key. Enumerating values rather than pattern-matching them is the point: a
  `/^\d+$/` on `vote_count.gte` would admit a hundred thousand cache keys and
  hand back the hole the cache closes. As written, the set of upstream requests
  this endpoint can produce is finite and small, so once it is warm the endpoint
  can be hammered without reaching TMDB at all. This is the defence that
  actually protects the quota, because it does not depend on believing anything
  the caller says.
- **A same-origin check** (`fromPlotPage`). Stops casual cross-site use and
  anything embedding the endpoint in another page. A script can forge
  `Sec-Fetch-Site` and `Referer`, so it is a speed bump, not a lock. Do not let
  it talk you into loosening the point above.

The cost of enumerating is that retuning a category ring (a different genre id,
a different vote threshold) means updating the allowlist too.
`functions/_lib/discover.test.js` reads `index.html` and fails if the homepage
asks for a path or sends a value the allowlist refuses, because otherwise that
drift shows up only as an empty poster strip with the reason in the browser
console.

The TMDB proxy Worker is reachable on its own hostname by anyone holding the
Supabase publishable key, which is public by design and which the mobile app
cannot do without. That cannot be closed, so it is answered the same way: the
Worker caches upstream responses (`apps/web/workers/tmdb-proxy/src/cache.js`),
which caps what an unwanted caller can cost at one upstream request per query
per TTL. It ships on its own `wrangler deploy`, not with this site.

## Public changelog

`/changelog` is the public product changelog (newest first, New / Improved /
Fixed). Process and the entry template live in `docs/ops/changelog.md`. Edit
`changelog.html` (and mirror strings in `copy/changelog.js`) on the same day as
each public ship.

## Agent-facing files

Beyond `llms.txt` and the API catalog above:

- `auth.md` states what can and cannot be authenticated to. The short answer is
  nothing, and it exists so an agent does not go looking for an OAuth flow that
  is absent on purpose.
- `.well-known/agent-skills/` holds SKILL.md files and a generated `index.json`
  (Agent Skills Discovery RFC v0.2.0). **Do not edit `index.json` by hand.** Each
  entry carries a SHA-256 of its SKILL.md, which is how a consumer checks it got
  what PLOT published; a stale digest makes a careful client reject the skill
  outright. Edit the SKILL.md, run `npm run skills`, commit both. CI runs
  `npm run skills:check`.

## Storybook (documentation only)

```
pnpm run storybook:website
```

This is a read-only visual reference for the site's shared patterns (tokens, buttons, nav, footer) — it does not build, bundle, or affect the deployed site in any way. Stories live in `stories/` and import directly from the real files (`theme.css`, `ui.css`, `nav.css`, `_partials/footer.html`), so they can't silently drift from what's live.
