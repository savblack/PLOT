# simpler-together-decide

Status: paused (built and checked; waiting on Savannah to look)
Branch: agent/2026-11-14-simpler-together-decide
Worktree: ~/Developer/PLOT-worktrees/2026-11-14-simpler-together-decide
Owner: Hailey (CPO) for design sign-off, Jacob (CTO) for the build
Updated: 2026-11-14

## In plain words

Savannah found the shipped Watch Together and Just Decide pages too busy, with
no obvious next step. This branch builds round 3A from the mockups
(https://claude.ai/artifact/VMDXnp5BmJJd9ekX2FS7QH): each page is one card
with one pink button, and one row of titles. For Just Decide she asked for
more options than the mockup, so the card shows movie or show, four mood
chips and three switches; kids and language sit behind "More options".
Nothing is on a pull request yet.

## Done

- Web `WatchTogetherHub.jsx/.css`: one card (faces pick who's watching, count,
  one button; requests as a notice), quiet links for invite/search/demo, one shelf.
- Web `TonightView.jsx` MoodCard + `TonightShelves.jsx` (one shelf, See more);
  phone bottom bar removed; dead CSS removed.
- iPhone `components/watch/WatchHub.tsx` and `app/(app)/tonight.tsx` match.
- Core: `TYPE_CHIPS`, `MOOD_CHIPS`, `SWITCH_CHIPS`, `watchlist` switch; watchlist-only
  skips the services shelf. Copy in `watchTogether.js` (hub.*) and `tonightPicker.js`.

## Checks

- `pnpm run check`: pass (168 warnings, as on main)
- `pnpm run test:unit`: 633 web, 1407 core, 88 scripts pass
- `pnpm run test:smoke`: 104 passed, 1 skipped
- Storybook (port 6048) checked at 1280 and 390.
- Not done: iPhone simulator.

## Next

1. Savannah looks in Storybook or the PR preview.
2. Open a PR (`/unslop`), then delete this file before merge.
