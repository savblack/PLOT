# now-on-streaming

Status: active
Branch: agent/2026-11-16-now-on-streaming
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-now-on-streaming
Updated: 2026-11-17

## In plain words

Home gets a new shelf, "Now on Streaming": movies that were in theaters and
became available to rent or buy in the last 60 days. It is built for web and
iPhone and sits above Most Anticipated. The code is finished and the checks
pass. It has been seen working on web Home (13 titles on an Australian
account). It has not been seen on the iPhone simulator, and no pull request
is open.

## Goal and owner

Savannah asked for it on 2026-11-17 (Hailey's area: core tracker, parity).

## Done

- `packages/core/tmdb.js`: `getNowOnStreaming()`. Two TMDB discover queries,
  both limited to titles a US storefront rents or sells now: digital release
  in the last 60 days (2 pages), cinema release in the last 180 days
  (3 pages). Five requests in the US, seven elsewhere, cached like every
  other TMDB call.
- Region fix (2026-11-17): TMDB has few digital dates outside the US, so an
  Australian account got one title. Outside the US the US digital list is
  also read, for timing only; availability still comes from the viewer's own
  region. Live results after the fix: AU 15, GB 17, CA 18, US 18.
- `packages/core/useDiscover.js`: `nowOnStreamingFrom()` keeps the digital
  releases that also had a cinema release; `loadDiscoverData` returns
  `streamingMovies`. A failed call hides only this shelf.
- `packages/core/homeLayout.js`: shelf id `streaming`, before `anticipated`.
  A saved Customize Home layout gets it appended at the end (existing rule).
- `packages/core/copy/discoverView.js`: title and subtitle.
- Web `DiscoverView.jsx`, iPhone `app/(app)/index.tsx` and
  `lib/homeShelves.ts`: draw the shelf with the same poster cards as Most
  Anticipated; it goes through `dedupeHomeShelves`.
- Storybook label maps and one unit test.

## Checks

- `pnpm run check`: pass. `pnpm run test:unit`: 642 / 1460 (1 skipped) / 91, no failures.
- `pnpm --filter @plot/mobile run typecheck`: clean. `pnpm run copy:check`: pass.
- Core code run against the live TMDB proxy on 2026-11-17: 18 titles, each
  with a cinema date followed by a later digital date.
- Web preview (port 5203), signed in, phone width: shelf shows 13 titles with
  posters, appears in Jump to, no console errors.
- Not done: desktop width, Customize Home, the iPhone simulator,
  `pnpm run test:smoke`.

## Next

1. Check it on the iPhone simulator.
2. Run `pnpm run test:smoke`, then open the pull request.

## Approvals

Given: build the shelf. Still needed: merge.
