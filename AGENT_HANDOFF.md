# signup-new-this-week

Status: active
Branch: agent/2026-11-12-signup-new-this-week
Worktree: ~/Developer/PLOT-worktrees/2026-11-12-signup-new-this-week
Owner: Jacob (CTO) lane; follows savblack/PLOT#1596 and PR #1607
Updated: 2026-11-12

## Plain summary

The sign-up, log-in and log-out pages used to scroll a wall of 21 local
posters (3.9 MB). They now show six small posters of what is trending on TMDB
this week, with titles. Savannah picked design A from the canvas
https://claude.ai/artifact/KL24Xkc19Vat6ShBg8mCfF ("make the sign-up faster,
load only a few posters and what's new"). The typed "plot" at the top of the
form is now the real wordmark.

## Done

- packages/core/newThisWeek.js: pick + fetch (one /trending/all/week call, no retries, never throws)
- packages/core/tests/unit/newThisWeek.test.js: 6 tests
- packages/core/copy/authPage.js: newThisWeek label
- apps/web/src/components/AuthShelf.jsx: shelf; fetches only when the panel is visible (min-width 769px)
- apps/web/src/pages/AuthPage.jsx, LogoutPage.jsx: shelf + wordmark logo
- apps/web/src/pages/AuthPage.css: shelf styles; scrolling wall removed
- apps/web/src/constants/heroPosters.js deleted (hero images kept: docs prototypes use them)

## Evidence (local dev, Staging proxy)

- /signup 1440x900, /login and /logout 1280x720: six posters with titles, no console errors
- Poster weight: 104 KB at w185, 301 KB at w342 (retina), vs 3.9 MB before
- 375 px phone: 0 TMDB calls, 0 poster requests, no sideways scroll

## Checks

- core newThisWeek tests: 6 pass
- pnpm run check: pass; test:unit 2,050 pass; CI source and contract checks: pass

## Next

Commit, push, open PR. Open a mobile parity issue: mobile's auth screen still
scrolls ~36 hardcoded poster paths (apps/mobile/app/(auth)/index.tsx).

## Approvals

Design A approved by Savannah in chat. Merge waits for her.
