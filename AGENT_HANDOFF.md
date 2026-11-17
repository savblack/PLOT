# new-releases-jump-panel

Status: paused
Branch: agent/2026-11-16-new-releases-jump-panel
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-new-releases-jump-panel
Updated: 2026-11-17

## In everyday words

On the web New Releases page the "Jump to" card is gone, and the Show / Genre
filter is the only thing in the side column, drawn as a proper card (panel).
The four sections that led the page (Last 30 Days, Most Binged Shows, Now
Showing, Top 10 by Platform) are removed too, on Savannah's instruction, so
the page is the genre sections only.

IMPORTANT, Savannah needs to decide: she asked for the four sections to go
because they are "already on the home page". In the current code they are
NOT on Home. They were moved off Home to New Releases this month
(`packages/core/homeLayout.js`). With this branch they would not appear
anywhere in the web app. The removal is its own commit so it can be dropped.

## Done

- Commit "drop the Jump to card": `NewReleasesView.jsx` (card removed, filter
  section is `hist-card new-releases-filter-card`), `app.css`.
- Commit "remove the four lead sections": `NewReleasesView.jsx` renders only
  `prepareNewReleaseGenreRails(...)`. Story added:
  `apps/web/src/stories/NewReleasesFilterPanel.stories.jsx`.
- Earlier pills, phone row and genre merge are undone (core matches main).

## Checks

- `pnpm run check`, `pnpm run test:unit`, `pnpm run test:smoke`: all passed.
- Filter card looked at in Storybook ("New Releases/Filter panel").
- Not seen: the real signed-in page (no local test login), dark theme.

## Next

1. Savannah's answer on the four sections: gone for good, back on Home, or
   kept on New Releases (revert the second commit).
2. If they stay removed: web still fetches their data
   (`loadNewReleaseData` loads recent/binged; the iPhone app uses the same
   load and still shows these sections). Trim the web fetch and decide the
   iPhone app's version; open a parity issue with the pull request.
3. Pull request on her yes. Delete this file in the last commit before merge.

## Approvals

Needed: Savannah's yes before a pull request or merge.
