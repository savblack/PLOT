# keyword-chips-beside-poster

On the web title panel, the keyword chips now sit beside the poster under the
genres, three at a time with a "+N more" chip. At phone width the header no
longer has large gaps between rows. Savannah needs to look at it and say
whether to open a pull request.

Status: paused
Branch: agent/2026-11-16-keyword-chips-beside-poster
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-keyword-chips-beside-poster
Owner: Hailey (product), built in Claude Code
Updated: 2026-11-17

## Goal

Savannah, 2026-11-17: move the web keyword chips beside the image under the
genres, show 3 at most, then the "+X more" chip. Follow-up the same day: the
layout at phone width on web "needs major cleaning up" (screenshot showed big
gaps between the kicker, title, rating, genres and each keyword row).

## Done

- `packages/core/browse.js`: `collapseKeywords` takes an optional `limit`
  (default unchanged at 4, so mobile is unchanged). Test added.
- `apps/web/src/components/MediaPanel.jsx`: keyword group moved inside
  `.panel-head-text`, after the genres; web passes a limit of 3.
- `apps/web/src/styles/app.css`: dropped the full-width keyword row rule; at
  <=599px the head's small text buttons opt out of `.panel button
  { min-height: 44px }`, which was the cause of the gaps. Tap area is padded
  with a pseudo-element (about 29px tall).
- `apps/web/src/stories/MediaPanel.stories.jsx`: `WithKeywordChips` story.

## Checks

- `node --test packages/core/tests/unit/browse.test.js`: 7 pass.
- `pnpm run check`: pass (lint, build, bundle size).
- Viewed the Storybook story at 375, 496 and 1280 wide, collapsed and expanded.
- Not done: the signed-in app itself (no test login), so "Customize artwork"
  beside the kicker was not seen at phone width. `test:smoke` not run.

## Next

Savannah reviews. If approved: delete this file, open the PR. "+N more" still
expands to all eight chips; she said "3 max at any given time", so confirm she
wants the expand kept.

## Approvals

None given beyond the request itself. PR and merge still need her yes.
