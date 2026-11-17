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
clapperboard icon. The iPhone screen's Out Today and Coming Soon rows are gone
too, so it matches web.

Top 10 by Platform is back, on Home, on both apps (Savannah: "i want the
charts back on the home tab"). It is the last shelf by default and can be
moved or hidden in Customize Home like any other. The two jobs that collect
its data keep their schedules; they were never off on main.

## Done

- Web page: `NewReleasesView.jsx` (filter card, genre rails only), `app.css`,
  story `NewReleasesFilterPanel.stories.jsx`.
- Shared load: `packages/core/useNewReleases.js` returns `{ genreRails }` only
  and no longer asks TMDB for recent releases or trending TV. Test updated.
- Charts: Home shelf `platforms`, last in `HOME_SECTION_IDS`
  (`packages/core/homeLayout.js`). Web draws it with `PlatformCharts` in
  `DiscoverView.jsx`; iPhone with `PlatformSection` in `index.tsx`, label in
  `apps/mobile/lib/homeShelves.ts`. `usePlatformCharts.js`, its test and the
  web shim are as on main. A layout saved before the charts left Home keeps
  the place it gave them (`homeLayout.test.js`).
- iPhone: `apps/mobile/app/(app)/index.tsx` drops Recently Released, Most
  Binged, Now Showing, Top 10 by Platform and their components and styles,
  then Out Today and Coming Soon ("make this match the web");
  `apps/mobile/components/HomeReleases.tsx` deleted.
- Chart jobs: `.github/workflows/netflix-top10.yml` and `streaming-top10.yml`
  match main again (schedules on).
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
- The charts shelf on Home was NOT seen on screen: it has no story, and
  Staging has no chart data, so it is empty in local dev by design.
- Not seen: the real signed-in page (no local test login), dark theme, the
  iPhone app in the simulator.

## Left alone, for Savannah to decide

- A web user who has saved their own menu order keeps that order.
- `packages/core/tests/unit/homeReleasesParity.test.js` still names the
  deleted HomeReleases in a comment; it tests `useUpcoming.js`, which is live.
- `.discover-plat-*` styles stay: My Lists' Top 5 switch and the design system
  page use them. `MEDIA.chartUnavailable` copy is now unused.

## Next

1. Pull request on Savannah's yes (no `[skip ci]`). Delete this file in the
   last commit before merge.

## Approvals

Given: "Remove everywhere" for the four sections; move New Releases under
Home; new icon; iPhone to match web; charts back on Home (which reverses switching the
chart jobs off). Needed: Savannah's yes before a pull request or merge.
