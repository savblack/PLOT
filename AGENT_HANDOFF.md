# mood-picker-rows

Status: paused
Branch: agent/2026-11-16-mood-picker-rows
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-mood-picker-rows
Updated: 2026-11-16

## In plain words

The "What are you in the mood for?" card on the Just Decide page (web) now shows
every filter as a labelled row of chips: nine moods, four score steps, every
length and every release era, plus where to look. The Movies / Shows switch is
only as wide as its two words. Nothing is hidden behind "More options" any more.
Savannah chose this layout ("Web A") from three mockups on 2026-11-16.
Nothing is merged; no pull request is open yet.

## Done

- `packages/core/tonightShelves.js`: `MOOD_GENRES`, `MOODS`, `moodOn`, `toggleMood`,
  `moodRows`, `moodFiltersOn`, `clearMoodFilters`. Mood shelves now hide when any
  genre is chosen (was: only when the Light or Gripping chip was on).
- `packages/core/copy/tonightPicker.js`: `chips.rows`, `chips.moods`, `chips.clearAll`.
- `apps/web/src/components/TonightView.jsx` + `.css`: the new `MoodCard`.
- `packages/core/tests/unit/tonightShelves.test.js`: four new tests.

## Decisions

- No "Light" chip on web. It was Funny + Romantic + Animated bundled, which would
  light three chips at once; those are now separate chips. Mobile still has Light.
- No "Epic" length (it was a placeholder in the mockup; the picker has no
  minimum-length filter).
- The desktop side column is 264px, so labels sit above their chips there;
  beside them between 600px and 1023px.
- No new PostHog event: the chips set options the existing draw event already reports.

## Checks

- `pnpm run check`: pass. `pnpm run test:unit` web 91 pass; core 1426 pass, 0 fail.
- Seen in Storybook (Pages/Tonight, Shelves) at 1280px and 800px; chips, Shows
  switch and Clear all clicked.
- Not run: `test-storybook:web`, `test:smoke`. Phone width (under 600px) not viewed.

## Next

1. Mobile parity: `apps/mobile/app/(app)/tonight.tsx` still uses the old chips and
   "More options". Build the mobile mockup (moods swipe sideways, Filters sheet)
   on the same core helpers.
2. Open the pull request once Savannah has looked. Delete this file in the last commit.

## Approvals

- Given: build Web A (Savannah, 2026-11-16).
- Needed: pull request, merge.
