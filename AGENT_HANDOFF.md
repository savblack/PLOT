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

- Savannah, 2026-11-17 (third request): put the rating on the top facts line
  ("2024 · 3 seasons · MA 15+") on all titles, web and iPhone, and drop the
  director/creator name from the head (it is in the credits below).
- `ParentalGuide` (web `.jsx`/`.css`, mobile `.tsx`) now renders the facts
  line itself with the rating inline; takes `facts`, `after` (a movie's "Ends
  at", placed after the rating: my choice) and, on mobile, `factsStyle`. The
  "Hide" control moved into the opened details. `author` removed from both
  `MediaPanel` files.
- Seen in Storybook (movie and series, rating opened) and on the simulator
  (movie: "2026 · 2h 39m · M · Ends at 9:14 pm", rating opened with Hide).
- Noticed on the simulator after a cold relaunch, not from this change: a
  "[useWatchlist] Could not get or create list" warning.

- Savannah, 2026-11-17 (fourth and fifth requests): iPhone shows 2 keyword
  chips then "+N more" (web stays at 3); remove "Ends at" from the header and
  remove the rating description, on both apps.
- `packages/core/browse.js`: `collapseKeywords` takes a `limit` again;
  `COLLAPSED_KEYWORD_CHIPS_COMPACT = 2` is what mobile passes.
- `ParentalGuide` (both apps): no meaning, region or advisories; `after` prop
  gone. Signed out, the rating is plain text. Signed in, tapping it shows
  only "Hide" (kept so the hide preference still has a home: my call, not
  hers; she may want it gone). `loadCertificationMeaning` in core is now
  unused by the apps; left in place.
- "Ends at" is still on the Up next episode row (`MediaPanel` ~line 203 web,
  ~580 mobile); only the header lost it.
- Simulator after these: "2026 · 2h 39m · M", 2 chips then "+6 more", rating
  tap shows Hide only. Web NOT re-viewed after this last edit (build passes).

- Savannah, 2026-11-17 (sixth request, superseding the "Hide only" note
  above): "Yes, remove Hide", then, on seeing Hide plus "Could not update the
  parental guide. Try again." in the simulator: "this shouldnt be anywhere
  ever". `ParentalGuide` on both apps is now a plain label in the facts line:
  no Hide, no "Show guide", no error text, no `signedIn`/`hidden`/`onSetShown`
  props. The four parental-guide strings are gone from
  `packages/core/copy/mediaPanel.js`.
- Consequence, my call: `profiles.show_parental_guide` is no longer read by
  either app, so a member who hid the rating earlier sees it again. The
  column and `App.jsx`'s select of it are untouched (no migration).
- Observed, not investigated: her Hide tap on the simulator (Staging) failed
  to save, which is what produced the error text.
- Seen after this: web Storybook "2021 · 2h 35m · PG-13" with no buttons in
  the line; simulator "2026 · 2h 39m · M", 2 chips then "+6 more".
- `pnpm run test:unit`: all suites pass (642, 1459, 91).

- Savannah, 2026-11-17 (seventh request): remove "Ends at" from the Up next
  episode row too. Done on both apps; `MEDIA_PANEL.endsAt` deleted from the
  copy catalog. No app shows "Ends at" anywhere now. `endsAtTime` in
  `packages/core/timeLeft.js` and its test are left in place, unused by the
  apps. Checks and `test:unit` pass; the Up next row was NOT viewed on screen.

## Checks

- `node --test packages/core/tests/unit/browse.test.js`: 7 pass.
- `pnpm run check`: pass (lint 0 errors, build, bundle size).
- `pnpm --filter @plot/mobile run typecheck`: pass.
- iPhone app run on the iPhone 17 Pro simulator (existing dev build from
  2026-11-07, Metro from this worktree on port 8097), signed in. Seen: a movie
  with 2 keywords (no "+N more"), a series with 8 (3 chips then "+5 more"),
  the expanded state ("Show fewer"), and a keyword chip opening its browse
  page. Expanded, the 8 chips take five rows in the narrow column and run
  below the poster's foot.
- Noticed, not from this change: a "two children with the same key" warning
  on Home in the dev build, before any title is opened.
- Viewed the Storybook story at 375, 496 and 1280 wide, collapsed and expanded.
- Not done: the signed-in app itself (no test login), so "Customize artwork"
  beside the kicker was not seen at phone width. `test:smoke` not run.

## Next

Savannah reviews. If approved: delete this file, open the PR. "+N more" still
expands to all eight chips; she said "3 max at any given time", so confirm she
wants the expand kept.

## Approvals

None given beyond the request itself. PR and merge still need her yes.
