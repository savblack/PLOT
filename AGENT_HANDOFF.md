# keyword-chips-beside-poster

On the title panel, on web and in the iPhone app, the keyword chips now sit
beside the poster under the genres, three at a time with a "+N more" chip. At phone width the header no
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

- Savannah, 2026-11-17 (second request): apply the 3-chip cap and the same
  layout to mobile as well.
- `packages/core/browse.js`: `COLLAPSED_KEYWORD_CHIPS` is 3 (was 4) for both
  apps. Test updated.
- `apps/web/src/components/MediaPanel.jsx`: keyword group moved inside
  `.panel-head-text`, after the genres.
- `apps/mobile/components/MediaPanel.tsx`: keyword row moved inside
  `headText`, after the genres; `headTags`/`tagRow` styles replaced by
  `keywordRow`.
- `apps/web/src/styles/app.css`: dropped the full-width keyword row rule; at
  <=599px the head's small text buttons opt out of `.panel button
  { min-height: 44px }`, which was the cause of the gaps. Tap area is padded
  with a pseudo-element (about 29px tall).
- `apps/web/src/stories/MediaPanel.stories.jsx`: `WithKeywordChips` story.

## Checks

- `node --test packages/core/tests/unit/browse.test.js`: 7 pass.
- `pnpm run check`: pass (lint 0 errors, build, bundle size).
- `pnpm --filter @plot/mobile run typecheck`: pass.
- Not done: the iPhone app has NOT been run in the simulator with this change.
  It compiles; the layout beside the 136pt poster is unseen.
- Viewed the Storybook story at 375, 496 and 1280 wide, collapsed and expanded.
- Not done: the signed-in app itself (no test login), so "Customize artwork"
  beside the kicker was not seen at phone width. `test:smoke` not run.

## Next

Savannah reviews. If approved: delete this file, open the PR. "+N more" still
expands to all eight chips; she said "3 max at any given time", so confirm she
wants the expand kept.

## Approvals

None given beyond the request itself. PR and merge still need her yes.
