# because-you-watched

Status: paused (PR open, waiting for review and Savannah's OK to merge)
Owner: Claude Code (Hailey's area: core tracker and web/mobile parity)
Branch: agent/2026-11-16-because-you-watched
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-because-you-watched
Latest pushed commit: see the PR head
Updated: 2026-11-16

## In plain words

Home has two new shelves. "Because you watched <title>" shows titles like one
thing you watched and liked. "Recommended for you" pools suggestions from up to
eight of your best-rated or most recent titles, and puts first the ones several
of them agree on. There is no AI: it uses TMDB's own "people who liked this
also liked" lists and simple scoring. Anything you have already watched, saved
or are watching is left out. Both shelves are free, sit under Continue
watching, and can be moved or hidden in Customize Home.

Update (same day): both shelves now only recommend titles first released in
the last 10 years (the titles they start from can be any age). The finished
shelves are saved on the device for the day, so Home asks TMDB at most once
a day per device and account.

## Done

- `packages/core/recommendations.js`: the rules (seed picking, both shelves, 10-year cutoff, the stored-day format). Pure, unit tested.
- `packages/core/useHomeShelves.js`: `useRecommendationShelves`, shared by web and mobile. Reads the day's stored shelves first and only fetches when there are none.
- Storage: web passes localStorage (`DiscoverView.jsx` `RECS_STORAGE`), mobile AsyncStorage (`index.tsx` `RECS_STORAGE`). Key `plot:home-recs:v1:<userId>`.
- `packages/core/homeLayout.js`: shelf ids `because`, `forYou` after `continue`.
- `packages/core/copy/discoverView.js`: `DISCOVER_VIEW.recommendations` wording.
- `packages/core/analyticsEvents.js` + `docs/analytics/README.md`: `recommendations_viewed`.
- Web: `apps/web/src/components/DiscoverView.jsx` renders both; `RankedCard` takes an optional `source` so opens are counted per shelf.
- Mobile: `apps/mobile/app/(app)/index.tsx`, `apps/mobile/lib/homeShelves.ts`, `apps/mobile/components/people/HomeShelves.tsx`.

## Checks

- `pnpm run check`: passed.
- `pnpm run test:unit`: passed (18 tests in `packages/core/tests/unit/recommendations.test.js`; one layout test changed to stop hardcoding a shelf position).
- `pnpm --filter @plot/mobile run typecheck`: passed.
- Web on Staging (localhost:5177, Savannah's Staging account): both shelves load with real titles, no console errors.
- Daily storage and 10-year cutoff, in Savannah's Chrome on localhost:5177 against Staging: both shelves drawn (6 and 20 titles), `plot:home-recs:v1:*` stored for 2026-11-16 (about 8 KB), stored titles dated 2017-09-06 to 2026-10-07. With the stored copy deleted, a load made 13 details requests (5 Continue watching shows + 8 seeds); with it present, a reload made 5 (Continue watching only).
- Not done: mobile not run on the simulator; no Cloudflare preview checked.

## Next

1. Watch the PR's checks; look at the Cloudflare preview's Home.
2. Run mobile on the iPhone simulator and look at the two shelves.
3. Delete this file in the last commit before merge.

## Approvals

- Given: build both shelves; open the PR; once-a-day saving per device; recommend only titles from the last 10 years (chat, 2026-11-16).
- Still needed: merging.
