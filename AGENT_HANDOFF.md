# episode-search

Status: paused (PR open, waiting for review)
Branch: agent/2026-11-03-episode-search
Worktree: ~/Developer/PLOT-worktrees/2026-11-03-episode-search
Owner: Hailey (product, web and mobile parity). Built by Claude Code.
Updated: 2026-11-03

## In plain words

People can now type an episode's title on a show's page and jump straight to
it, on web and mobile, instead of paging through seasons. Nothing needs
Savannah except reviewing and merging the PR.

## Goal

Issue #1445: search a show's episodes by title across all seasons.

## Done

- `packages/core/episodeSearch.js`: matcher, paced season loader (2 at a time,
  150ms apart), `useEpisodeSearch` hook. Tests in
  `packages/core/tests/unit/episodeSearch.test.js`.
- Web: search box above the season picker in `EpisodeGuide`
  (`apps/web/src/components/MediaPanel.jsx`), styles in `app.css`.
- Mobile: same in `apps/mobile/components/MediaPanel.tsx`.
- Event `episode_search_result_opened` via the `onEpisodeSearch` seam; failed
  seasons report `load_failed` with `resource: episode_search`. Documented in
  `docs/analytics/README.md`.
- Copy in `packages/core/copy/mediaPanel.js`.

## Checks

- `pnpm run check`: pass (0 errors; 175 warnings, same as main).
- `pnpm run test:unit`: pass (all suites, 0 failures).
- `pnpm run edge:check`: pass (the import engine bundle was regenerated because
  it embeds `config.js` and `actionFailures.js`).
- Mobile typecheck: pass. Mobile lint warnings unchanged (38).
- Web checked in Storybook (Panels/MediaPanel, With providers): search, jump
  across seasons, highlight, no-match note, Escape clears.

## Not verified

- Mobile was not run on a device or simulator. Scroll-to-row uses
  `getInnerViewNode` + `measureLayout`, which only a device run proves.
- Signed-in watched state in results was covered by unit tests, not by hand.

## Next

Review the PR. Before merge, run the mobile smoke on the title panel, then
delete this file in the last commit.

## Approvals

None needed beyond the usual merge approval. No migrations, no data writes.
