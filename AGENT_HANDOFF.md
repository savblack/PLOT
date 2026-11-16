# search-in-place

The search box (Cmd/Ctrl+K) now has a "Search in:" row: Everywhere, Home, Calendar, My Lists, History. Picking a page searches only the titles on that page, straight from what the app already has loaded. Web only so far. Savannah needs to try it signed in and say whether to open a pull request.

Status: paused (pull request open, waiting on Savannah)
Branch: agent/2026-11-16-search-in-place
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-search-in-place
Updated: 2026-11-16T12:10:00Z
Owner: Hailey (product). Requested by Savannah in Claude Code.

## Goal

Let people search titles within one page (Home, Calendar, My Lists, History) from the search palette.

## Done

- `packages/core/search.js`: `SEARCH_PLACES`, `PLACE_MATCH_LIMIT`, `placeSearchRows(place, sources)`.
- `packages/core/useUnifiedSearch.js`: `place` + `placeRows` options. A place search is local only (no TMDB, no friends RPC), ignores the "@" and "/" prefixes, and reports `search_performed` with `mode` set to the place.
- `packages/core/copy/searchPalette.js`: copy for the row, hints and empty state.
- `apps/web/src/components/SearchPalette.jsx` + `.css`: the chip row (signed-in only), per-place rows, list name or date under each match.
- Tests: `packages/core/tests/unit/search.test.js` (6 new), story `SearchInMyLists`.

## Web page search bars retired (Savannah said yes, 2026-11-16)

- Removed the title search field from `MyListsView.jsx`, `ListPage.jsx` (including the shared-list phone search button), `HistoryView.jsx` and `CalendarView.jsx`, with their dead styles in `app.css` and `CollaborativeLists.css`.
- Removed stories that tested them: `ListPageSearchKeepsFocus`, `PhoneInListSearch`, and the search step of `CustomListPageFilters`.
- Guide: already hidden on `main` behind `GUIDE_ENABLED` (PR 1712, merged), so its search bar is unreachable and was left alone. Kept on purpose: the add-a-title pickers in `ListSections.jsx`, Settings search, find friends, Compare and Watch Together pickers, episode search.
- Kept the shared copy keys (`searchThisList`, `searchPlaceholder`, `CALENDAR_VIEW.search`, ...) and `searchCollectionTitles` in core, because mobile still uses them until issue 1719.
- Checks after this: `pnpm run check`, `test:unit`, `copy:check`, `core:check` passed; story tests for MyListsView, CollaborativeLists, SearchPalette passed (17). Pages looked at in Storybook at 1280 wide: My Lists, a custom list, History. Calendar not looked at. `test:smoke` not run.

## Smart lists place (Savannah asked, 2026-11-16)

- `SEARCH_PLACES` now has `smart` between `lists` and `history`. Label is `SMART_LISTS.section`.
- `loadSmartListTitles()` in `packages/core/smartLists.js` loads each smart list the way opening it does (a discover list's first page; a watchlist or history list's checked rows), one list at a time. Web calls it the first time the chip is picked.
- The chip shows only for a Premium profile with at least one smart list.
- Limit: a discover smart list is searched on its first page of matches only, not "load more".
- Tests: `smartLists.test.js` (loader), `search.test.js` (rows), story `SearchInSmartLists`.
- `origin/main` merged in at this point (brings the hidden Guide). After the merge: `pnpm run check`, `test:unit`, `copy:check`, `core:check` passed; story tests for SearchPalette, MyListsView, CollaborativeLists passed (18).

## Mobile (Savannah asked, 2026-11-16), closes issue 1719

- `apps/mobile/app/(app)/search.tsx` already used `useUnifiedSearch`; it now has the "Search in" row and gathers each place's rows. Calendar events come from a small `CalendarSource` component mounted only while Calendar is picked, because `useCalendarEvents` has no off switch.
- `apps/mobile/app/(app)/my-lists.tsx`: its own search field and results grid are gone. The header search button now opens the search screen like every other page.
- Shared with web, new in core: `listsPlaceSources`, `homePlaceShelves` (`packages/core/search.js`). Web's palette now calls them too. Also fixed web's Home place dropping the later cinema shelves.
- Left alone on mobile (task pickers): settings, your-people, compare, onboarding seed, MediaPanel episode search, SearchPickModal, Watch Together. Guide is hidden.
- Run in the iOS simulator (iPhone 17 Pro, Staging account): the row draws, My Lists selects, typing "link" listed LINK CLICK with "Watchlist"; My Lists page draws with no search field. Not run: Home, Calendar, History, Smart lists places on device; opening a result; dark theme; VoiceOver.
- Simulator notes: the screen shows one action behind each tap, and typed text can drop characters or open the dev menu on "d". Metro for this worktree is launch config `mobile-metro-search` (port 8097).
- Checks: `pnpm run check`, `test:unit`, `copy:check`, `core:check`, `pnpm --filter @plot/mobile run typecheck` passed; SearchPalette story tests passed (3).

## Checks

- Passed: `pnpm run check`, `pnpm run test:unit`, `pnpm run copy:check`, `pnpm run core:check`, `vitest run --project=storybook src/stories/SearchPalette.stories.jsx` (2 passed).
- Seen working in Storybook for My Lists.
- Not done: Home, Calendar and History have unit tests only; not tried against a signed-in account. `test:smoke` not run.

## Decisions made (reversible)

- Opens on Everywhere every time, rather than preselecting the page you are on.
- Home searches the Discover shelves (hero, hot, weekly, binged, cinema, anticipated) plus Watching. It does not include platform charts, people shelves or pinned shelves.
- Calendar searches "My dates" from today on. Reminders are skipped (no title page to open).
- Favorites rows carry no list name, to avoid a new `regionalWords()` call site.
- No new PostHog event: `search_performed` already counts a search; `mode` now also takes home / calendar / lists / history.

## Next

1. Savannah tries it signed in on the web app.
2. Open the PR (run `/unslop`, `/before-and-after`) and link the mobile parity issue: https://github.com/savblack/PLOT/issues/1719
3. Savannah's direction (2026-11-16): search lives only in the web side nav and the mobile top-left icon. Web is done on this branch (see below). Mobile is issue 1719.
4. Delete this file in the last commit before merge.

## Approvals

- Given: none beyond building it.
- Needed: PR, merge.
