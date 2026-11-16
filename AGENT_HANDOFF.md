# remove-home-greeting

The date line and the "Good evening, Savannah" greeting are gone from the top of Home on both the web app and the iPhone app. Nothing is live yet: the change sits on its own branch and needs a pull request and Savannah's OK to merge.

Status: paused
Branch: agent/2026-11-16-remove-home-greeting
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-remove-home-greeting
Owner: Claude Code (asked directly by Savannah, 2026-11-16)
Updated: 2026-11-16

## Goal

Delete the date and the greeting from Home on mobile and web.

## Done

- Web Home: removed the greeting heading and the date in the toolbar. `DiscoverToolbar` takes `showDate` (default true); Home passes false. New Releases and Calendar keep their date.
- Mobile Home: removed the date line, the greeting, and their two styles.
- Removed what that orphaned: `packages/core/greeting.js`, `DISCOVER_VIEW.greeting` copy, its unit test, the `.home-greeting` CSS.

## Checks

- `pnpm run check`: passed (lint incl. mobile typecheck, build, bundle size).
- `pnpm run test:unit`: 91 passed. `node --test packages/core/tests/unit/onboardingRedesign.test.js`: 11 passed.
- Not done: no look at the running web app or the iPhone simulator.

## Next

1. Look at Home in the Cloudflare preview (desktop and phone width) and in the simulator; web Home now has no h1.
2. Open the pull request. Delete this file in the last commit before merge.

## Approvals

Given: make the change. Still needed: merge.
