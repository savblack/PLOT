# insights-screen

Status: paused (pull request #1810 open, waiting for Savannah's review)
Branch: agent/2026-11-21-insights-screen
Worktree: ~/Developer/PLOT-worktrees/2026-11-21-insights-screen
Updated: 2026-11-21

## In plain words

Plot has an Insights page on the website and the iPhone app, in the menu after
History. Round 2, from Savannah's notes on 21 Nov 2026:

- No intro text at the top: just chips (This month, the year, and All time
  dashed and locked for Free).
- Cards flow into balanced columns that fill the width, so no blank patches.
- Anything empty is an action (Find a title, import, rate in History).
- The "character" is back as a watching type ("The Binger", "The Horror
  Devotee") on a dark card, chosen by clear rules, with 2 or 3 true reasons
  and last month's type.
- Free sees Premium's cards filled with sample numbers, tagged and dashed.
  An empty account sees actions first, then the whole page as a sample.

## Done

- Logic: `packages/core/insights.js` (watchingType, typeHistory, SAMPLE_INSIGHTS and the rest), copy in `packages/core/copy/insightsView.js`, tests in `packages/core/tests/unit/insights.test.js`.
- Web: `apps/web/src/components/InsightsView.jsx` + `.css`, route `/insights`, nav item and icon, Storybook `Pages/Insights` (Free, Premium, Empty, NewAccount).
- Mobile: `apps/mobile/app/(app)/insights.tsx`, drawer entry, icon.
- Events: `insights_opened`; the empty account reuses the activation nudge events with surface `insights`.
- Smoke test `apps/web/tests/smoke/tab-bar.spec.js` expects Insights in the phone menu.

## Checks

- `pnpm run check`: pass (0 errors, warning count unchanged at 168).
- `pnpm run test:unit`: pass (684 + 1546 + 99).
- `pnpm run test:smoke`: pass (131 passed, 7 skipped).
- `pnpm --filter @plot/mobile run typecheck`: pass.
- Web seen in Storybook at 1400px: Free, Premium, Empty, NewAccount.
- Not run: the iPhone screen in a simulator; web against a real Staging account.

## Approvals

- Given: build G and H; replace then rebuild the character; chips; sample Premium preview; CTAs for empty states (Savannah, 21 Nov 2026).
- Still needed: merge; the type names and lines are proposals for her to edit.

## Next

- Savannah reviews the PR and its Cloudflare preview.
- Later: taste match across friends, "shows finished" (#1805), a share card for the watching type.
- Delete this file in the last commit before merge.
