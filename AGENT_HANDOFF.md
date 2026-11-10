# home-scroll-banners

Status: paused
Branch: agent/2026-11-10-home-scroll-banners
Worktree: ~/Developer/PLOT-worktrees/2026-11-10-home-scroll-banners
Updated: 2026-11-10

## In plain words

Home on a computer screen would only scroll when the pointer sat over the
strip of posters at the bottom, and the cards above (first-win, Finishing
touches, Watch together) took most of the screen. Now the whole page scrolls
from anywhere, and a new person sees fewer cards at once. Savannah needs to
look at Home and say whether to open a pull request.

## Goal

Savannah's report, 2026-11-10: "too much going on here and i'm not able to
scroll, i can only scroll if my cursor is in a certain spot and even then i
can't see the titles properly because of all the banners above".

## Done

- `apps/web/src/styles/app.css` (min-width 1024 Home block): removed the locked
  page with two self-scrolling columns. `.app-main` is the one scroller again;
  `.home-side` stays sticky and scrolls itself only when taller than the window.
- `packages/core/watchTogetherHome.js`: `watchTogetherHomeVisible` takes
  `settlingIn`; the Watch together card waits while the first-win card or
  Finishing touches is on Home. Web and mobile cards both pass it. Unit test added.
- `apps/web/src/components/FinishingTouches.jsx`: starts collapsed on a wide
  screen when the first-win card is above it (mobile already starts collapsed).

## Checks

- `pnpm run check`: passed (lint incl. mobile typecheck, build).
- `pnpm run test:unit`: passed. `node --test packages/core/tests/unit/watchTogetherHome.test.js`: 3 pass.
- Browser, temporary static page with the real Home class skeleton and app.css
  at 1440x900 and 1024x768: `.app-main` overflow-y auto, scrollHeight 3864 vs
  900; wheel over the banner area scrolled the page; bottom rail reachable;
  side column stuck at 16px. Page deleted afterwards.
- Not checked: the real signed-in Home (no test login available here), and
  Chromatic (quota used up, see memory note).

## Next

- Savannah looks at Home on the branch or approves a pull request.
- No approvals given yet for PR or merge.
