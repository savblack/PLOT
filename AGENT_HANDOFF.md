# watching-sort

Plain version: Watching lists (Home's Continue watching, My Lists, the profile) now put the show you most recently watched first, even when you logged it in History, ticked an episode on the title page, or imported it. Undoing an episode tick no longer moves the show to the front once the database change is applied. Web and mobile both get a sort menu on Watching. Savannah needs to review the draft PR and approve the database change before merge.

Status: paused (draft PR open, waiting for review)
Owner: Jacob (CTO) / Hailey (parity)
Branch: agent/2026-11-03-watching-sort
Worktree: ~/Developer/PLOT-worktrees/2026-11-03-watching-sort
Updated: 2026-11-10

## Done

- Core: `watchingOrder.js` (last-activity sort, other orders), `watchingActivity.js` (reads watch_events, episode_watch_overrides, history), `useWatchingSort.js` (sort menu + air dates).
- `useWatching` loads activity, stays sorted after ticks, re-reads activity on HISTORY_CHANGED / EPISODES_CHANGED.
- Continue watching sorts before the 24 cap; detail fetch keyed on the set of ids, not order.
- Migration `20261110120000` (trigger keeps a supplied updated_at, clamps the future). NOT applied anywhere.
- Sort menu in the Watching kebab on web (`ListSections.jsx`) and mobile (`my-lists.tsx`), saved in local storage per user.

## Checks

Passed: `pnpm run check`, `pnpm run test:unit`, mobile typecheck, `migrations:check`, `copy:check`, `core:check`.
Run 2026-11-03 with Savannah's OK (local production copy, torn down after):
- `db:migration-test`: PASS, both pending migrations apply cleanly (20261102120000 from main, and ours).
- `db:function-diff`: only `update_watching_progress_updated_at` changes; the one removed line is the unconditional `now()`, now inside the condition. search_path kept.
- `db:drift`: FAILS on pre-existing drift, none from this branch. Our version 20261110120000 is not taken on either project. Production never recorded 20261102120000 (main, merged 2026-11-02); production has 20261025102415 with no file on main; Staging is 4 behind and differs in objects.
- 2026-11-10: `.env`'s `SUPABASE_DB_URL` is now a valid pooler connection string; DB scripts run as-is. Branch merged with main (31 commits) and the migration renamed 20261103120000 -> 20261110120000, because production had already applied 20261103130000 and an older-than-latest version risks being skipped on merge.
Pending: second-agent read of the migration, screenshots, a Staging test for the trigger.

## Next

A different agent reads the migration diff. Fix the 20261102120000 production apply separately before or alongside merge. Delete this file in the last commit before merge.

## Approvals

Given: build, draft PR. Still needed: merging (the migration goes to production on merge).
