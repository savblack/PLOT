# compare-picker-unify

Status: active
Branch: agent/2026-11-16-compare-picker-unify
Updated: 2026-11-17T09:40:00Z

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

## Fourth round (2026-11-16): saved comparisons

- A second left card, "Your comparisons", lists people Savannah has compared
  with (name, @handle), each with a refresh icon and an x. Web: under the
  people card on both Compare pages. Mobile: a card on the picker.
- Kept on the device only (`localStorage` / AsyncStorage, key
  `plot-saved-comparisons:<viewer id>`), who and when, never the comparison.
  Core: `savedComparisons.js`, `useSavedComparisons.js`, tests in
  `tests/unit/savedComparisons.test.js`. A person is saved when a comparison
  loads and dropped when the server answers not_found or not_visible.
- Refresh re-asks the server (retry on the open comparison, otherwise it
  opens that comparison). Events `saved_comparison_refreshed` and
  `saved_comparison_removed` are named in `analyticsEvents.js`, with no
  properties. Not yet added to `docs/analytics/README.md`.
- Decision made here, reversible: device storage instead of a database table,
  because a table is a migration that applies to production on merge and
  needs Savannah's yes. Cost: the list does not follow her to another device,
  and a saved name stays visible after a block until that row is opened.

## Fifth round (2026-11-17): saved comparisons sync across devices

Savannah chose "Sync across devices", so the device-storage version above is
replaced. THIS BRANCH NOW CARRIES A MIGRATION. It applies to production the
moment the branch merges to `main`, so merging needs her explicit yes.

- `supabase/migrations/20261117090000_saved_comparisons.sql`: new table
  `saved_comparisons` (viewer, target, compared_at), RLS on, no policies, no
  grants. Three security definer functions are the only way in:
  `list_saved_comparisons()` (carries `private.not_blocked`),
  `save_comparison(uuid)`, `remove_saved_comparison(uuid)`. Expand only.
- `list_saved_comparisons` added to BLOCK_FILTERED in `scripts/check-block-clause.mjs`.
- `scripts/staging-saved-comparisons-test.sql`: 15 checks from four viewpoints.
- `useSavedComparisons(viewerId)` now calls those functions. A failed remove
  reports `action_failed` with action `saved_comparison_remove`.
  `importEngine.generated.js` regenerated because `actionFailures.js` changed.
- Device storage adapters removed (`apps/web/src/utils/deviceStorage.js`,
  `deviceStorage` in `apps/mobile/lib/storage.ts`).

Passed: `migrations:check`, `migrations:contract`, `db:block-clause`,
`staging:test -- saved-comparisons` (15 of 15, rolled back), `check`,
`test:unit`, `copy:check`, `core:check`, `edge:check`, mobile `typecheck`.

NOT run, and required before merge: `pnpm run db:migration-test` and
`pnpm run db:drift`. Both read production, which needs Savannah to ask for it.
`gen:db-types` is also not run: it reads production's schema, which will not
have the table until this merges.

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

Given: build boards 1 and 2; sync saved comparisons across devices (2026-11-17). Still needed: running the two production-reading checks, opening a pull request, merging (which applies the migration to production).

## Next

Show Savannah the Storybook stories or a Cloudflare preview, apply her notes,
then open the pull request when she says so. Delete this file before merge.
