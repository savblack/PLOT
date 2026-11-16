# mood-picker-rows

Status: paused
Branch: agent/2026-11-16-mood-picker-rows
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-mood-picker-rows
Updated: 2026-11-16

## In plain words

The "What are you in the mood for?" card on Just Decide now shows far more
choices, on web and in the phone app. Web shows every filter as a labelled row
of chips. The phone app shows the moods under a Mood label, then one plain
"Filters" line (for example "Rated 7+, My services") with Edit, which opens a
sheet with score, length, release, where, kids and language. Nothing hides behind "More options" any more. Savannah chose the
web layout ("Web A") and the mobile layout from mockups on 2026-11-16, then asked
for the follow-ups to be actioned. A pull request is open; nothing is merged.

## Done

- `packages/core/tonightShelves.js`: `MOOD_GENRES`, `MOODS`, `moodOn`, `toggleMood`,
  `moodRows`, `activeMoodChoices`, `moodFiltersOn`, `clearMoodFilters`. Mood shelves
  hide when any genre is chosen (was: only with the Light or Gripping chip).
- `packages/core/copy/tonightPicker.js`: `chips.rows`, `chips.moods`, `chips.clearAll`,
  `chips.ratedMin`.
- `packages/core/tonightPicker.js`: `tonight_picks_drawn` also reports `min_score`,
  `max_minutes`, `era` (documented in `docs/analytics/README.md`, typed in `config.js`).
- Web: `apps/web/src/components/TonightView.jsx` + `.css`, the new `MoodCard`.
- Mobile: `apps/mobile/app/(app)/tonight.tsx`, the new `MoodCard` with a `BottomSheet`.
- Tests: `tonightShelves.test.js` (five new), `engagementAnalytics.test.js` (extended).

## Decisions

- Mobile was rebuilt on 2026-11-16 after Savannah rejected the first version
  (swiping moods, a Filters chip, pink removable chips: too much pink, three pill
  rows). She chose "option 1": a neutral Movies / Shows switch, wrapped moods, a
  one-line filter summary, a compact Pick button, Clear all inside the sheet.

- No "Light" chip. It was Funny + Romantic + Animated bundled, which would light
  three chips at once; those are separate chips now. `MOOD_CHIPS` and the light /
  gripping cases of `toggleChip` stay in core, unused by either app.
- No "Epic" length and no "Show N titles" button: both were mockup placeholders.
- Web desktop column is 264px, so labels sit above their chips there.
- No new PostHog event. The existing draw event gained three properties instead.
- `moreOptions` / `fewerOptions` copy is now unused by both apps; left in place.

## Checks

- `pnpm run check`: pass (0 lint errors). Core unit tests 1427 pass, 0 fail; web 91 pass.
- `pnpm --filter @plot/mobile run typecheck`: pass.
- `pnpm run test-storybook:web`: 71 pass.
- `pnpm run test:smoke`: 122 pass, 2 failed while a build was rewriting `dist`
  under the test server (letterboxd-recovery, premium-preview); both pass rerun alone.
- Web seen in Storybook at 1280, 800 and 390px.
- Mobile run in the iOS simulator (iPhone 17 Pro, dev client, Metro from this
  worktree): the option 1 card with the summary line reading "Rated 7+, My
  services", and the Filters sheet opening from it with Clear all at its foot.
  Not run: Shows, Clear all, a real pick, dark theme, VoiceOver.

## Next

1. Savannah reviews the pull request. Delete this file in the last commit before merge.

## Approvals

- Given: build Web A; build mobile; action the follow-ups (Savannah, 2026-11-16).
- Needed: merge.
