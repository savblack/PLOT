# website-critique-fixes

Status: paused
Branch: agent/2026-11-18-website-critique-fixes
Worktree: ~/Developer/PLOT-worktrees/2026-11-18-website-critique-fixes
Owner: Savannah (approved "build 1 to 3" and "then build 4 to 6" in chat, 2026-11-19)
Updated: 2026-11-19

## In plain words

Six design fixes for theplot.tv from the November 18 design critique are built on this branch.
Nothing is live yet. Savannah still has to say whether to open a pull request, and the fixes go
live only after it is merged.

1. On a phone, the pricing comparison table shows Free and Premium side by side.
2. Movie and TV pages say Movies, TV, In theaters and Jul 15, 2026 (US wording).
3. Buttons keep readable text when hovered on Taste Match and Support. The pricing table headings
   are dark instead of faint pink.
4. No real UI text is under 11px (46 sizes raised to 11.2px).
5. The homepage keeps pointing at Start tracking. Premium gets a "See Premium" button, and the app
   waitlist button is an outline instead of pink.
6. Em dashes are gone from visible messages. The phone menu "Sign up" and section buttons are compact.

References: critique snapshot `.impeccable/critique/2026-11-18T12-40-42Z__theplot-tv.md` (main checkout),
fix plan doc https://claude.ai/artifact/GxHQvSFbJWE1nXSj3bHHBz,
mockups https://claude.ai/code/artifact/9e5c9776-424a-4b74-9dd0-3afc789db00e.

## Record

- Fix 1: `apps/website/pricing.html`, 640px media query (no min-width, fixed layout, sticky plan-name header at top 84px, price cards hidden in the table header only).
- Fix 2: `supabase/functions/title-page/index.ts` (Films/Series to Movies/TV, In cinemas to In theaters, US date order, "· Plot"), then `pnpm run title-renderer`. Ticker label `In Cinemas` to `In Theaters` in `index.html`.
- Fix 3: `a:hover` scoped to `a:not(.btn):not(.footer-cta):not(.nav-cta)` in `taste-match.css` and `support.css`; `.cmp-group td` ink, 0.82rem.
- Fix 4: sub-11px `font-size` rem values raised to 0.8rem (14px-base pages) or 0.7rem (16px-base title pages and What's On, `marketing-feed/index.ts`). Left as drawn: the miniature app screenshots (`index.html` `.disc-*`, `.ticker-sep`; `premium-stories.css` `.av`, `.my-theme small`, `.my-widget small`).
- Fix 5: `index.html` hero sub, hero-trust line, `.pm-cta` with See Premium (`data-cta="home-premium-see"`), `#appNotifyForm button` outline, indie actions (Start tracking `data-cta="indie-signup"` + See Premium `data-cta="indie-premium"`). Catalog mirror in `copy/index.js`.
  - Deviation from the mockup: the "in your pocket" app section and its phone picture are kept; only its button was demoted. Cutting the section would remove the live phone showcase.
- Fix 6: em dashes removed from `index.html` (og alt, error, success), `js/whats-on.js` error, `404.html` title, catalog `copy/common.js`, `copy/404.js`. Compact phone buttons in `nav.css`, `title-page.css`, `marketing-feed/index.ts`, `index.html`.
- Regenerated: CSP hashes (`pnpm run csp`), footer/nav stamps (`pnpm run footer`), title renderer. Hand-stamped: `title-page.css?v=` (sha256, 12 chars), `premium-stories.css?v=` (sha256, 8), `WHATS_ON_JS_VERSION` = 20261119.
- Deploy note: merging also deploys the `title-page` and `marketing-feed` Supabase edge functions to production.

## Checks

- `pnpm run check`: pass (exit 0; warnings are the existing mobile backlog).
- `pnpm run test:unit`: pass (644, 1488 and 99 tests, 0 failed).
- `node --test apps/website/functions/_lib/*.test.js`: pass (80).
- `pnpm run edge:check`: pass (39 functions).
- Browser (`pnpm run dev:website`): pricing at 375px fits (table 340px, no page overflow), sticky header at 84px; desktop pricing unchanged; movie page wording; Taste Match hover ink on pink; homepage copy, compact buttons, outline Notify.
- Not checked locally: `title-page.css` changes on the movie page (the page loads its CSS from theplot.tv, so local dev shows the live file). Check the Cloudflare preview.

## Not done (needs Savannah)

- Decisions in the fix plan doc: dark mode, Android line on About, $3 vs $2 in the pricing title, "US$3", homepage panel tints.
- Import list differs (Home: Letterboxd, Trakt, TV Time, IMDb; About: Letterboxd, Trakt, Netflix, TMDB). The app code supports Letterboxd, Trakt, TV Time, IMDb and Netflix; TMDB was not found. Left alone: factual copy.
- "Save to your plot" on movie pages kept lowercase (may be a deliberate pun).

## Next

Ask Savannah whether to open a pull request. Before merge: check the Cloudflare preview on phone and desktop, remove this file in the last commit.
