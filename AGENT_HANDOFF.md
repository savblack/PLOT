# watching-sort

Plain version: Watching lists (Home's Continue watching, My Lists, the profile) now put the show you most recently watched first, even when you logged it in History, ticked an episode on the title page, or imported it. Undoing an episode tick no longer moves the show to the front once the database change is applied. Web and mobile both get a sort menu on Watching. Savannah needs to review the draft PR and approve the database change before merge.

Status: paused (draft PR open, waiting for review)
Owner: Jacob (CTO) / Hailey (parity)
Branch: agent/2026-11-03-watching-sort
Worktree: ~/Developer/PLOT-worktrees/2026-11-03-watching-sort
Updated: 2026-11-03

## Done

- Core: `watchingOrder.js` (last-activity sort, other orders), `watchingActivity.js` (reads watch_events, episode_watch_overrides, history), `useWatchingSort.js` (sort menu + air dates).
- `useWatching` loads activity, stays sorted after ticks, re-reads activity on HISTORY_CHANGED / EPISODES_CHANGED.
- Continue watching sorts before the 24 cap; detail fetch keyed on the set of ids, not order.
- Migration `20261103120000` (trigger keeps a supplied updated_at, clamps the future). NOT applied anywhere.
- Sort menu in the Watching kebab on web (`ListSections.jsx`) and mobile (`my-lists.tsx`), saved in local storage per user.

## Checks

Passed: `pnpm run check`, `pnpm run test:unit`, mobile typecheck, `migrations:check`, `copy:check`, `core:check`.
Pending (need review / credentials): `pnpm run db:migration-test`, `pnpm run db:function-diff`, `pnpm run db:drift`, screenshots in the running apps.

## Next

Reviewer runs the pending DB checks, then a different agent reads the migration diff. Delete this file in the last commit before merge.

## Approvals

Given: build, draft PR. Still needed: merging (the migration goes to production on merge).
