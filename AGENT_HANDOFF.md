# 2026-11-13-calendar-poster-quote

Status: paused (code done, waiting on Savannah to open a PR)
Owner: Jacob (CTO) area; done by Claude Code
Branch: agent/2026-11-13-calendar-poster-quote
Worktree: ~/Developer/PLOT-worktrees/2026-11-13-calendar-poster-quote
Updated: 2026-11-13

## Plain English

Three bugs found while making App Store screenshots are fixed in shared code, so web and the iPhone app both get them:

1. Calendar said "Nothing coming up" for a show you are partway through when its next episode is in a newer season than the one you're on (Abbott Elementary, S06E07 on Dec 2). It now also checks the season that airs next.
2. Picking a title "From history" for your Top 5 on the iPhone app saved the wrong title number and, when the history entry had no poster, a blank tile. It now saves the right title and fills a missing poster from TMDB.
3. The title page's audience quote picked the shortest TMDB review, whatever it said. It now only quotes reviews their author rated 7/10 or higher, and skips any with culture-war or abusive words.

## Changes

- packages/core/calendar.js: in-progress shows also read `next_episode_to_air`'s season when it is ahead of `current_season`; "behind" count spans seasons via `details.seasons[].episode_count`, null when unknown.
- packages/core/useTopLists.js: new `topListSlotFields()`; `tmdb_id` wins over `id`; missing poster/title filled from TMDB details.
- packages/core/reviews.js: `pickAudienceQuote` requires `author_details.rating >= 7`, blocks a word list, strips wrapping quote marks.
- Tests: calendar.test.js (+2), reviews.test.js (+4, existing ones given ratings), topListSlotFields.test.js (new, 4).

## Checks

- `pnpm run check`: pass (170 lint warnings, same as main).
- `pnpm run test:unit` and `node --test packages/core/tests/unit/*.test.js`: all pass.
- Real data: Rings of Power reviews now yield a 7/10 positive quote.
- Not checked in a running app (web or simulator).

## Next

- Open a PR (needs Savannah's go-ahead), remove this file in the last commit before merge.
- Follow-up: existing mobile Top 5 rows picked from history may hold a history row id as `tmdb_id`. Fixing them is a production data change and needs Savannah's OK.
