# compare-picker-unify

Status: active
Branch: agent/2026-11-16-compare-picker-unify
Updated: 2026-11-16T13:00:00Z

## In plain words

The Compare page now has two columns on web: a card on the left to search for
and pick a person, and the comparison on the right. Before anyone is picked the
right side shows a made-up sample ("You and Maya") so the page is never blank.
The big match number sits on the left of its card with the circles on the
right. On iPhone the picker is the same card with the sample underneath.
Savannah asked for this on 2026-11-16 after choosing boards 1 and 2 of the
design canvas https://claude.ai/artifact/QRsiQgFm7spm1s3Fv6qXao. Nothing is
merged. She needs to look at it and say whether to open a pull request.

## Goal and owner

Owner: Savannah (product area: Hailey). Make Compare use shared components and
match other pages, on web and mobile.

## Done

- Core: `EXAMPLE_OVERLAP` and `exampleGenreNames` in `packages/core/tasteOverlap.js`;
  sample and empty-state wording in `packages/core/copy/tasteOverlap.js`
  (removed `pickerTitle`, `pickerIntro`, `publicProfile`, `privateApproved`, no longer shown).
- Web: new `apps/web/src/components/ComparePeoplePanel.jsx` (SearchField,
  EmptyState, Avatar, `.hist-card`). `TasteOverlapView` takes `side` and
  `example`; `/compare` renders it with the sample, `/u/:username/compare`
  with the real data and the chosen person highlighted. Round back button,
  second heading and the "You and X" pill are gone; below 1024px the
  comparison shows the shared BackLink to /compare.
- Mobile: `app/(app)/compare.tsx` uses BackBar, a card, EmptyState, and
  `TasteOverlapExample` exported from `components/taste/TasteOverlapView.tsx`.
- Stories: PickerFollowingNobody, PickerWithPeople, WithPeoplePanel.

## Second round (2026-11-16, Savannah's notes)

- Left panel is now 264px with a 72px gap, the same as `.cal-side` in `.cal-body`.
- The privacy note is deleted on web and mobile, with its copy key.
- The sample now shows everything a full comparison does except Share: "You
  both loved", "Where you disagree" and the shared-watchlist row.
  `exampleOverlap(titles)` in core lays invented ratings over titles from
  `tmdb.getTrending('all', 'week')` (`useExampleOverlap`), so no id is typed in.
  If that request fails, the two title sections are left out.

## Third round (2026-11-16)

- The Sample chip sits on the right of the "You and Maya" heading, web and mobile.
- Savannah said these are fine as they are, so do not change them: the
  "@handle" page title once a person is picked, the iPhone comparison screen's
  own back button and heading, and the ellipsis on a long name beside
  "Request pending".

## Checks

Passed: `pnpm run check`, `pnpm run test:unit`, `pnpm run copy:check`,
`pnpm run core:check`, `pnpm --filter @plot/mobile run typecheck`.
Looked at in Storybook at 1280px and 375px. Not run: the signed-in web app,
the iPhone simulator, `test:smoke`, `test-storybook:web`.

## Open points

- The sample's posters change weekly with TMDB trending; a fixed set would need titles resolved by search.
- Wording differs from the mockup: tag is "Sample" and the empty-state button
  is "Search people", because "Example" and "Find people" already belong to
  other copy modules.
- No new PostHog event: the only new button focuses the search box.

## Approvals

Given: build boards 1 and 2. Still needed: opening a pull request, merging.

## Next

Show Savannah the Storybook stories or a Cloudflare preview, apply her notes,
then open the pull request when she says so. Delete this file before merge.
