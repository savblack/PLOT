# insights-screen

Status: paused (pull request open, waiting for Savannah's review)
Branch: agent/2026-11-21-insights-screen
Worktree: ~/Developer/PLOT-worktrees/2026-11-21-insights-screen
Updated: 2026-11-21

## In plain words

Plot now has an Insights page on the website and the iPhone app, in the menu
after History. Free users see This month and This year: a "Lately" sentence
about their last 30 days, headline numbers, their highest-rated titles and how
those moved, how they compare with the crowd, and "On this day". Premium adds
All time, the change from last year, how lately differs from their usual, hot
takes, and which days they watch. The mockup's "character" card was replaced by
the plain "Lately" sentence, at Savannah's request (21 Nov 2026).

## Done

- Shared logic: `packages/core/insights.js`, copy in `packages/core/copy/insightsView.js`, tests in `packages/core/tests/unit/insights.test.js`.
- Web: `apps/web/src/components/InsightsView.jsx` + `.css`, route `/insights`, nav item and icon, Storybook story `Pages/Insights`.
- Mobile: `apps/mobile/app/(app)/insights.tsx`, drawer entry, icon.
- Event `insights_opened` ({ premium, source }).
- Issues: covers most of #1803 (phase 1) and part of #1805 (phase 3). Replaces #1804 (characters) with "Lately".
- Latest pushed commit: see `git log -1` on the branch.

## Checks

- `pnpm run check`: pass (0 errors; no new warnings in touched files).
- `pnpm run test:unit`: pass (684 + 1542 + 99).
- `pnpm --filter @plot/mobile run typecheck`: pass.
- Web page seen in Storybook (Free, Premium, phone width).
- Not run: the iPhone screen on a simulator; the web page against real Staging data.

## Approvals

- Given: build G (Free) and H (Premium); rethink the character card (Savannah, 21 Nov 2026).
- Still needed: merge. Menu placement (own item after History) and closing #1804 are her call.

## Next

- Savannah reviews the PR and its Cloudflare preview.
- Later: taste match across friends and "shows finished" (#1805), sharing the Lately card.
- Delete this file in the last commit before merge.
