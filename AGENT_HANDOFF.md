# ui-unify

Status: paused (built and checked; waiting on Savannah to look at it)
Branch: agent/2026-11-13-ui-unify
Worktree: ~/Developer/PLOT-worktrees/2026-11-13-ui-unify
Owner: Jacob (CTO) for the build, Hailey (CPO) for the design sign-off
Updated: 2026-11-13

## In plain words

Watch Together and Just Decide now use the same layout as History and My Lists
on web: a narrow column of cards on the left and the wide content on the right
(stacked on phones). Watch Together leads with sending your invite link,
since most people invite someone not on Plot. Just Decide opens on rows of
titles that fit tonight instead of four question screens. The iPhone app got
the same changes. Nothing is merged or on a pull request yet. Savannah should
look at it before a pull request opens. Mockups (private):
https://claude.ai/artifact/VMDXnp5BmJJd9ekX2FS7QH

## Done

- Checkpoint bfa289272: shared `.sr-only`, pill radius token, `useWide.js`,
  `titleMeta`/`pickResultMeta` in core.
- Watch Together (web): `WatchTogetherHub.jsx/.css` replaces the hub and the dark
  start page. Left column: who's watching (pick a person or "All of you"),
  requests, invite link. Right: shelves of shared titles, or with nobody yet your
  watchlist preview and the Sam demo. Core: `hubStage`, `joinNames`,
  `sharedOnDate`, `INVITE_SHARED_KEY`; copy `WATCH_TOGETHER.hub.*`.
  `useInviteShare` records when the link was shared (localStorage).
  ~145 lines of dead `wt-*` CSS removed.
- Just Decide (web): `TonightShelves.jsx` + core `tonightShelves.js` (chips map to
  picker options; shelves From your watchlist / Under 2 hours / Something light /
  Something gripping / On your services). Left column: chips, Pick one for me,
  Surprise me, Filters, saved searches. Question screens and their CSS removed.
  Free: watchlist shelves free; the services shelf is Premium; Pick keeps the
  one-free-pick-a-day rule.
- iPhone: `components/watch/WatchHub.tsx` (people-card row + shelves + invite-first
  empty state), `WatchChrome` aliases replaced by shared components, `BackBar` gets
  an optional label. `app/(app)/tonight.tsx` opens on chips and shelves.

## Review findings (fixed, Nov 13)

- Page frame: both pages on History's frame; Watch Together's 900px switch → 1024.
- Titles: one h1 per page (`.phone-only-h1` for page h1s); in-app sub-page titles
  and Just Decide titles use `.discover-section-title`; `.wt-card-title` = card tier.
- Cards: `.cal-mini-card` + `.hist-card` one rule; every 20px/12px/24px card,
  image and sheet corner on `--radius-md/lg/badge`.
- Chips: `.wt-chip`, `.tonight-hero-chip`, legacy `.chip` family removed; Tag gains
  artwork/success/warning tones. Countdown labels moved to `@plot/core/countdown.js`
  (web + iPhone My Lists captions).
- Avatars: `components/Avatar.jsx` replaces 10 hand-drawn ones on web.
- Breakpoints: one scale (tokens.css "Breakpoints"): 479 / 599 / 767-768 / 1023-1024
  / 1280; `TABLET_QUERY` in hooks/useWide.js.
- Dark card: gone on both apps.
- iPhone kit: `PrimaryButton`/`SecondaryButton` gone; tonight.tsx on font/radius
  tokens; image fade from core `imageScrimStops` (web `--image-scrim-gradient`).
- Logic twice: `useUpgradeNews`, `useUserSearch` in `@plot/core/useWatchTogether.js`.
- Not done: PublicProfilePage's big header avatar, ShareCard's (drawn into an
  image) and PlansPage's decorative dots keep their own styles.

## Checks

- `pnpm run check`: pass (lint 0 errors; 168 warnings, none in touched files)
- `pnpm --filter @plot/core run test:unit`: 1396 pass (new `tonightShelves`, `countdown` tests)
- `pnpm --filter @plot/web run test:unit`: 633 pass
- `pnpm --filter @plot/mobile run typecheck`: pass
- Storybook (worktree, port 6047): desktop and 390px checked by eye for both pages.
- Not done: iPhone simulator; Cloudflare preview; the `SearchAndInvite` story's
  in-browser check doesn't register typing (search works by hand; story isn't in
  the CI interaction-test set).

## Next

1. Savannah reviews in Storybook or a preview. Then open a PR (needs
   `/unslop`, `/before-and-after`).
2. Done: iPhone Watch Together and Just Decide now use My Lists' layout (glass
   title bar, full-width collapsible sections, edge-to-edge poster rails, a
   stacked "Who's watching?" list instead of sideways cards). Same order as web.
   Not seen on a device: the simulator was signed out on another branch's build.
3. Deferred: merge `.cal-mini-card` + `.hist-card`, one tablet breakpoint, shared
   web Avatar, shared people-search hook in core, iPhone clipboard for Copy.

## Approvals

- Given: review, unify, mock up; build Watch Together C+A and Just Decide D; same
  left-column layout as Home, My Lists and History.
- Needed: design sign-off, PR, merge.
