# apps/website

The theplot.tv marketing site: static HTML pages, deployed as-is (no build step). Stays that way intentionally.

## Local development

```
npm run dev:website
```

Serves the site on port 5202 through `wrangler pages dev`, so the Pages Functions in `functions/` run alongside the static pages — the same as production.

**Don't serve this directory with a plain static file server** (`python3 -m http.server`, `npx serve`, and friends). The pages render, but every `functions/` route 404s, and the front-end swallows those failures silently: the homepage's TMDB-fed surfaces (the What's On poster wall, the desktop side posters, the hero filmstrip, the guide-demo cards) all call `/api/discover`, and each one is wrapped in a bare `.catch()` that leaves it empty rather than showing an error. An empty poster wall locally is almost always this, not a broken proxy.

Running `wrangler pages dev .` from this directory by hand works too — two notes on why:

- The compatibility date is pinned in `wrangler.jsonc`, because `wrangler pages dev` otherwise defaults to *today's* date, which a slightly older `workerd` binary refuses to start on (`requires compatibility date "…", but the newest date supported by this server binary is "…"`). Pinning a past date is always safe; the runtime keeps supporting old dates. That file is local-dev-only and must stay that way: adding `pages_build_output_dir` to it would make it the source of truth for the whole Pages project and cut the dashboard configuration out of deploys. The file says so as well.
- It runs from `apps/website` because both that config and the Pages Functions are discovered relative to the working directory. From the repo root, wrangler misses the pin and picks up the *web app's* root `functions/` instead, so this site's routes 404 — which looks identical to the static-server failure above.

The repo `.env` is not loaded, so functions needing secrets (e.g. `/api/newsletter`) won't work locally. `/api/discover` needs none: it forwards to the public TMDB proxy Worker with the site's own public anon key.

## Storybook (documentation only)

```
npm run storybook:website
```

This is a read-only visual reference for the site's shared patterns (tokens, buttons, nav, footer) — it does not build, bundle, or affect the deployed site in any way. Stories live in `stories/` and import directly from the real files (`theme.css`, `nav.css`, `_partials/footer.html`) wherever possible, so they can't silently drift from what's live.

Two things aren't in a shared file yet and are mirrored by hand in `stories/*.mirror.css` — each page currently carries its own inline `<style>` copy:

- Button rules (`.btn`, `.btn-primary`, `.btn-outline`, `.btn-outline-white`)
- Footer rules (`footer`, `.footer-*`)

If you change these in a page's `<style>` block, update the matching mirror file too, or the Storybook docs will drift from the real site.
