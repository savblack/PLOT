# hide-tv-guide

The TV guide is hidden everywhere a person can see it: the menu on web and
mobile, the Guide page, the TV region row in Settings, and the credits line.
Nothing was deleted, so one switch brings it back. Savannah needs to approve
the merge; nothing is live until then.

Status: paused
Owner: Hailey (product). Asked for by Savannah in Claude Code, 2026-11-16.
Branch: agent/2026-11-16-hide-tv-guide
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-hide-tv-guide
Latest pushed commit before this note: 73ea46509
Updated: 2026-11-16

## Done

- `GUIDE_ENABLED = false` in `packages/core/features.js` is the one switch.
- Core: `guideInMenu()` returns false, `APP_NAV_ITEMS` drops `guide`, the
  Settings search words drop "broadcast guide market", and the TVmaze credit
  no longer names the TV guide.
- Web: `/guide` redirects to `/home`; Settings > Viewing has no TV region row.
- Mobile: `/(app)/guide` redirects Home; Settings has no TV region row or sheet.
- Marketing site: TVmaze credit in `about.html` and `copy/about.js`.
- `docs/ops/app-store-listing.md`: store description no longer says "check the TV guide".
- Tests: `broadcastGuide.spec.js` skips while hidden; `tab-bar.spec.js` uses New
  Releases; a new core unit test asserts the guide is in no menu.

## Checks

- `pnpm run check`: pass
- `pnpm run test:unit`: pass (2152 tests, 1 skipped on purpose)
- `pnpm --filter @plot/mobile run typecheck`: pass
- `copy:check`, `core:check`, `footer:check`, `csp:check`: pass
- Smoke (`PLOT_SMOKE_PORT=4291 npx playwright test`): 112 pass, 7 skipped (the
  guide spec). `app.spec.js` "public profile route" timed out once in the full
  run and passed 3 of 3 alone.
- Not checked: the phone app in the simulator, Storybook tests.

## Left as is, on purpose

- `.github/workflows/broadcast-guide.yml` still refreshes listings every 6 hours.
- Old guide reminders still show on the web calendar and in the calendar feed.
  Nothing creates new ones.
- Saved TV regions (`broadcast_preferences`) are untouched and still in the data export.
- Dev-only `/guide-preview` routes and the Design System page's guide swatches.

## Next

Open the PR (not opened yet). Delete this file in the last commit before merge.

## Approvals

- Given: hide the TV guide on all surfaces.
- Still needed: merge to `main` (deploys web and the marketing site).
