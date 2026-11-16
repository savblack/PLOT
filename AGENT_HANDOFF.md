# search-in-place

The search box (Cmd/Ctrl+K) now has a "Search in:" row: Everywhere, Home, Calendar, My Lists, History. Picking a page searches only the titles on that page, straight from what the app already has loaded. Web only so far. Savannah needs to try it signed in and say whether to open a pull request.

Status: paused
Branch: agent/2026-11-16-search-in-place
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-search-in-place
Updated: 2026-11-16T10:05:00Z
Owner: Hailey (product). Requested by Savannah in Claude Code.

## Goal

Let people search titles within one page (Home, Calendar, My Lists, History) from the search palette.

## Done

- `packages/core/search.js`: `SEARCH_PLACES`, `PLACE_MATCH_LIMIT`, `placeSearchRows(place, sources)`.
- `packages/core/useUnifiedSearch.js`: `place` + `placeRows` options. A place search is local only (no TMDB, no friends RPC), ignores the "@" and "/" prefixes, and reports `search_performed` with `mode` set to the place.
- `packages/core/copy/searchPalette.js`: copy for the row, hints and empty state.
- `apps/web/src/components/SearchPalette.jsx` + `.css`: the chip row (signed-in only), per-place rows, list name or date under each match.
- Tests: `packages/core/tests/unit/search.test.js` (6 new), story `SearchInMyLists`.

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
3. Savannah's direction (2026-11-16): search lives only in the web side nav and the mobile top-left icon. In-page title search bars are to be retired on both apps. Not started. The issue lists every bar, the ones recommended to keep (settings, find friends, pickers, episode search), and the gaps to close first (no single-list or Guide place; page bars filter in place, the palette does not).
4. Delete this file in the last commit before merge.

## Approvals

- Given: none beyond building it.
- Needed: PR, merge.
