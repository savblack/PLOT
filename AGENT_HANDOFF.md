# because-you-watched

Status: paused (built and checked on web; waiting for Savannah's go-ahead to open a PR)
Owner: Claude Code (Hailey's area: core tracker and web/mobile parity)
Branch: agent/2026-11-16-because-you-watched
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-because-you-watched
Latest pushed commit: 9d123e591 (checkpoint), plus this handoff update
Updated: 2026-11-16

## In plain words

Home has two new shelves. "Because you watched <title>" shows titles like one
thing you watched and liked. "Recommended for you" pools suggestions from up to
eight of your best-rated or most recent titles, and puts first the ones several
of them agree on. There is no AI: it uses TMDB's own "people who liked this
also liked" lists and simple scoring. Anything you have already watched, saved
or are watching is left out. Both shelves are free, sit under Continue
watching, and can be moved or hidden in Customize Home.

## Done

- `packages/core/recommendations.js`: the rules (seed picking, both shelves). Pure, unit tested.
- `packages/core/useHomeShelves.js`: `useRecommendationShelves`, shared by web and mobile.
- `packages/core/homeLayout.js`: shelf ids `because`, `forYou` after `continue`.
- `packages/core/copy/discoverView.js`: `DISCOVER_VIEW.recommendations` wording.
- `packages/core/analyticsEvents.js` + `docs/analytics/README.md`: `recommendations_viewed`.
- Web: `apps/web/src/components/DiscoverView.jsx` renders both; `RankedCard` takes an optional `source` so opens are counted per shelf.
- Mobile: `apps/mobile/app/(app)/index.tsx`, `apps/mobile/lib/homeShelves.ts`, `apps/mobile/components/people/HomeShelves.tsx`.

## Checks

- `pnpm run check`: passed.
- `pnpm run test:unit`: passed (11 new tests in `packages/core/tests/unit/recommendations.test.js`; one layout test changed to stop hardcoding a shelf position).
- `pnpm --filter @plot/mobile run typecheck`: passed.
- Web on Staging (localhost:5177, Savannah's Staging account): both shelves load with real titles, no console errors.
- Not done: mobile not run on the simulator; no Cloudflare preview checked.

## Next

1. Savannah's OK to open the PR (no migration, no billing, no permissions change).
2. Run mobile on the iPhone simulator and look at the two shelves.

## Approvals

- Given: build both shelves (chat, 2026-11-16).
- Still needed: opening the PR and merging.
