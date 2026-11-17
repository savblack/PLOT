# new-releases-jump-panel

Status: paused
Branch: agent/2026-11-16-new-releases-jump-panel
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-new-releases-jump-panel
Updated: 2026-11-17

## In everyday words

New Releases is now just the genre sections, on web and on iPhone. On web the
side column is the Show / Genre filter drawn as a card (panel); the "Jump to"
card is gone. The four sections (the recent-releases row, Most Binged Shows,
Now Showing, Top 10 by Platform) are removed from both apps: Savannah was told
they are not on Home either and answered "Remove everywhere" (17 Nov 2026).
New Releases sits straight under Home in the menu on both apps and has a new
clapperboard icon.

## Done

- Web page: `NewReleasesView.jsx` (filter card, genre rails only), `app.css`,
  story `NewReleasesFilterPanel.stories.jsx`.
- Shared load: `packages/core/useNewReleases.js` returns `{ genreRails }` only
  and no longer asks TMDB for recent releases or trending TV. Test updated.
- Charts: `PlatformCharts` removed from `DiscoverView.jsx`;
  `packages/core/usePlatformCharts.js`, its test and the web shim deleted
  (nothing imported them any more).
- iPhone: `apps/mobile/app/(app)/index.tsx` drops Recently Released, Most
  Binged, Now Showing, Top 10 by Platform and their components and styles.
  Out Today and Coming Soon still lead the screen (Savannah did not name them).
- Menu: `packages/core/navigation.js` lists New Releases after Home;
  `DrawerMenu.tsx` the same. Icon: clapperboard in `navIcons.jsx` (web) and
  `NavIcons.tsx` (iPhone, which was reusing the calendar icon).
- Docs: `docs/agents/web-mobile-parity.md`, comments in `homeLayout.js` and
  `useDiscover.js`.

## Checks

- `pnpm run check`, `pnpm run test:unit`, `pnpm run test:smoke`,
  `pnpm --filter @plot/mobile run typecheck`: all passed.
- Seen in Storybook: the filter card, and the side menu with New Releases
  under Home and the new icon.
- Not seen: the real signed-in page (no local test login), dark theme, the
  iPhone app in the simulator.

## Left alone, for Savannah to decide

- A web user who has saved their own menu order keeps that order.
- The nightly jobs that fill the `platform_charts` table still run
  (`scripts/sync-netflix-top10.mjs`, `scripts/sync-streaming-top10.mjs`);
  nothing reads that table in the apps now.
- `HomeReleases.tsx` still knows how to draw Recently Released; no screen asks
  for it.
- `.discover-plat-*` styles stay: My Lists' Top 5 switch and the design system
  page use them. `MEDIA.chartUnavailable` copy is now unused.

## Next

1. Pull request on Savannah's yes (no `[skip ci]`). Delete this file in the
   last commit before merge.

## Approvals

Given: "Remove everywhere" for the four sections; move New Releases under
Home; new icon. Needed: Savannah's yes before a pull request or merge.
