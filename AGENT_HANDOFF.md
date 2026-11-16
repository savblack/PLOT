# new-releases-jump-panel

Status: paused
Branch: agent/2026-11-16-new-releases-jump-panel
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-new-releases-jump-panel
Updated: 2026-11-17

## In everyday words

The "Jump to" card on the web app's New Releases page was a list of about 25
rows, taller than the screen, and almost every row ended in the same number
(18). It is now about half the height: the four page sections (Last 30 Days,
Most Binged Shows, Now Showing, Top 10 by Platform) stay as rows, and the
genres sit under a "Genres" label as small pills that wrap. The numbers are
gone. The look-alike genres are merged: TV's "Action & Adventure", "Sci-Fi &
Fantasy" and "War & Politics" no longer get their own sections; their shows
appear in Action, Adventure, Science Fiction, Fantasy and War. On a phone,
where the page had no way to jump at all, there is now one row of pills that
stays at the top and scrolls sideways.

Savannah needs to: look at it and say whether this is the direction. Nothing
is merged and no pull request is open.

## Goal

Savannah asked for "a better way to do this panel for new releases" (the Jump
to card). "Better" is her call; this is a proposal built to be looked at.

## Done

- `packages/core/useNewReleases.js`: `buildGenreRailDefinitions` folds TV's
  combined genres into the movie genres they name (`TV_GENRE_HOMES`, keyed by
  name, ids still come from the catalog). Folded shows also carry the rail's
  movie genre id so the page's genre filter keeps them. This changes the
  rails on the iPhone app too, since it reads the same module.
- `apps/web/src/components/NewReleasesJump.jsx` (new): `NewReleasesJumpCard`
  (desktop side column) and `NewReleasesJumpBar` (sticky chip row below
  1024px). `apps/web/src/hooks/useActiveRail.js` (new) tracks the section in
  view for both.
- `apps/web/src/components/NewReleasesView.jsx`: uses the two above; genre
  rails are tagged `isGenre`.
- `apps/web/src/styles/app.css`: `.new-releases-jump-*`, `.new-releases-jumpbar`.
- `packages/core/copy/discoverView.js`: `newReleasesJump` ("Genres", "Jump to section").
- `apps/web/src/stories/NewReleasesJump.stories.jsx` (new): "New Releases/Jump to".
- Tests: `packages/core/tests/unit/useNewReleases.test.js` (three new or changed).

## Checks

- `pnpm run check`: passed (0 lint errors; 169 warnings, none in the new files).
- `pnpm run test:unit`: passed.
- `pnpm run copy:check`, `pnpm run core:check`: passed.
- Looked at in Storybook at 1280 and 375 wide: the card is 642px tall (was
  about 1,250), jumping lands on the section, the active pill turns accent,
  the phone row sticks and centers the active pill, no sideways page scroll.

## Not verified

- The real signed-in page (no local test login). In particular the phone
  row sticking under the real app header, and the merged genre sections with
  live TMDB data. Check both on the pull request's Cloudflare preview.
- Dark theme and Premium themes were not looked at.
- The iPhone app was not run; its genre sections change with the core merge.

## Next

1. Savannah's verdict. Open questions for her: keep the genre merge (it
   changes the page's sections, not only the card)? Keep the phone row?
2. If yes: open the pull request (without `[skip ci]`), and open a mobile
   parity issue: the iPhone app has no jump index for these sections.
3. Delete this file in the last commit before merge.

## Approvals

Given: none beyond building the proposal. Needed: Savannah's yes before a
pull request or merge.
