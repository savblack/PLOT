# onboarding-shelf-loader

Status: paused
Branch: agent/2026-11-09-onboarding-shelf-loader
Worktree: ~/Developer/PLOT-worktrees/2026-11-09-onboarding-shelf-loader
Owner: Hailey (product, onboarding)
Updated: 2026-11-09

## In plain words

The "Building your plot" screen at the end of onboarding now shows the titles
the person just picked landing on a little shelf (two rows of three), instead
of the fanned posters and four rotating lines. It is also much faster: it
leaves as soon as the account is saved, after a minimum of about 1.1 seconds,
and fades into Home in a quarter second. Before, the website always took 6.6
seconds and the phone app about 2. Savannah chose this design (option 2,
"Shelf") from the mockup page https://claude.ai/artifact/9D4PvcaLgR9Tv5Gxyp5LjJ.

## What changed

- `packages/core/onboardingSetup.js`: `buildingShelf()` (picks first, trending
  fills to 6), `BUILDING_MIN_MS` 1100, `BUILDING_FADE_MS` 250,
  `BUILDING_SHELF_SIZE` 6. Removed `buildingFan()` and `buildingLines()`.
- `packages/core/copy/onboardingFlow.js`: removed the four rotating lines and
  `noServicesFirstLine`. Web now shows the same single `saving()` line as mobile.
- Web: `OnboardingFlow.jsx`, `OnboardingScreen.jsx`, `OnboardingFlow.css`, story.
- Mobile: `apps/mobile/app/onboarding/building.tsx` (Animated stagger, respects
  Reduce Motion).

## Checks

- `pnpm run check`: pass (lint + build)
- `pnpm --filter @plot/mobile run typecheck`: pass; eslint on building.tsx clean
- `pnpm run test:unit`: pass (557 / 1253 / 22)
- `copy:check`, `core:check`: pass
- Storybook `Onboarding/Flow/Building One Pick` rendered and its animations
  finished (story titles have no posters, so tiles are blank there).
- Not done: Chromatic (quota paused), on-device check on mobile, a real
  onboarding run with real posters.

## Next

Savannah to decide whether to open the PR. Before merge: delete this file.
No approvals pending beyond that; no data, payments or publishing involved.
