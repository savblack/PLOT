# search-in-place

The search box (Cmd/Ctrl+K) now has a "Search in:" row: Everywhere, Home, Calendar, My Lists, History. Picking a page searches only the titles on that page, straight from what the app already has loaded. Web only so far. Savannah needs to try it signed in and say whether to open a pull request.

Status: paused
Branch: agent/2026-11-16-search-in-place
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-search-in-place
Updated: 2026-11-16T10:40:00Z
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
- Kept on purpose: Guide search (TV programs, no "Search in" place covers it), the add-a-title pickers in `ListSections.jsx`, Settings search, find friends, Compare and Watch Together pickers, episode search.
- Kept the shared copy keys (`searchThisList`, `searchPlaceholder`, `CALENDAR_VIEW.search`, ...) and `searchCollectionTitles` in core, because mobile still uses them until issue 1719.
- Known loss: a smart list's titles are not in the My Lists place (they load when the list is opened), so smart lists have no title search now.
- Checks after this: `pnpm run check`, `test:unit`, `copy:check`, `core:check` passed; story tests for MyListsView, CollaborativeLists, SearchPalette passed (17). Pages looked at in Storybook at 1280 wide: My Lists, a custom list, History. Calendar not looked at. `test:smoke` not run.

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
