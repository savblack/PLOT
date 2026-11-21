# 2026-11-21-together-mood-step

Status: active (built and checked; second-agent migration review in progress; no PR yet)
Branch: agent/2026-11-21-together-mood-step
Worktree: ~/Developer/PLOT-worktrees/2026-11-21-together-mood-step
Owner: Savannah (Claude Code session)
Updated: 2026-11-21

## In plain words

Watch together now asks "What are you in the mood for?" before the swipe cards: Movies, TV or
both, mood chips (with how many shared titles each keeps), and My services. The cards are then only
what fits, and the other person sees what was picked. It needed a database change, which Savannah
approved on 2026-11-21. It goes to production when merged. Built on web and iPhone.

## Done

- Migration `supabase/migrations/20261121120000_watch_together_session_moods.sql` (additive):
  `watch_together_sessions.filters`, new `start_watch_together_session_filtered(uuid, jsonb)`,
  `get_watch_together_session` returns `filters` (one added line; old start function untouched).
- Core: `packages/core/moodGenres.js` (mood list moved out of tonightShelves.js, re-exported there);
  mood-step helpers in `packages/core/watchTogether.js`; `startWatchTogetherSession(otherId, mood)`;
  copy `WATCH_TOGETHER.mood`, `errors.nothing_fits`; analytics props on `watch_together_session_started`.
- Web: `WatchTogetherMood.jsx` at `/together/decide/:username`; every Decide together and Start
  again route through it; session shows "You picked / Sam picked". Chip has a `count` prop.
  Story `Watch together/Mood step` with two interaction tests.
- Mobile: `components/watch/WatchMood.tsx`, route `(app)/together/decide/[username]`, same entry
  points, filters on the session, Chip `count`.
- Docs: watch-together README "Mood step", analytics README row, web-mobile-parity row.
- Staging test `scripts/staging-watch-together-test.sql`: 5 new cases.

## Checks

- `node --test packages/core/tests/unit/*.test.js`: 1562 pass. `pnpm run test:unit`: pass.
- `pnpm run check`: pass. `copy:check`, `migrations:check`, `migrations:contract`, `db:block-clause`: pass.
- `db:migration-test`: applies cleanly to a copy of production. `db:function-diff`: 0 lines removed.
- `staging:test -- watch-together`: 55/55 pass (rolled back).
- Storybook `Watch together/Mood step`: 2/2 interaction tests pass; looked at desktop and 375px.
- Not run: iOS simulator; a real two-person session in the app.

## Next

1. Act on the second-agent migration review.
2. Push, then ask Savannah before opening the PR. Delete this file in the last commit before merge.
