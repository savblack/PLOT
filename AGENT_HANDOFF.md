# 2026-11-11-import-rejections

Status: paused (PR open, waiting for Savannah's review)
Owner: Jacob (CTO lane), run from a Claude Code side session
Branch: agent/2026-11-10-2026-11-11-import-rejections
Worktree: ~/Developer/PLOT-worktrees/2026-11-10-2026-11-11-import-rejections
PR: https://github.com/savblack/PLOT/pull/1540 (open, not merged)
Updated: 2026-11-11

## Plain English

A new user's six import files (IMDb and Letterboxd) were all refused. This branch
fixes two of the three causes in Plot's code and explains the third clearly.
Nothing goes live until Savannah merges the PR and okays redeploying the
background import worker.

## Done (evidence: unit tests, `pnpm run check`, `pnpm run edge:check`, all green)

- IMDb ratings: production has `IMPORT_EVENTS_ENABLED` and `IMPORT_ANNOTATIONS_ENABLED`
  set but not "true" (checked by digest comparison only; values never printed).
  Any TV series row made the whole ratings file fail, and even a movie-only IMDb
  file would match and then write nothing. Fixed: movies write through the
  standard history path; show ratings are left out with a note; episodes and
  other unsupported title types are left out and counted.
- IMDb list files: IMDb names exports with a random ID (the user's were
  `7aff628a-….csv` list, 2,348 rows; `035da5c3-….csv` ratings, 30 rows). A name
  saying watchlist goes to the watchlist; any other IMDb list becomes a custom
  list "IMDb list" keyed `imdb:list:<file name>`. With the event importer off,
  every IMDb list gets one clear message.
- Letterboxd: the user's file was `watchlist-<user>-…-utc.csv` (watchlist, 508
  rows). Names containing watchlist/watched, including copy markers, now import.
  A name that says neither is refused with a pointer to the .zip.
- Production database checked read-only: every table and function the event
  importer calls exists with matching inputs.

## Next

- Savannah approved switching on list imports in production. My commands were
  blocked by the session's safety check, so she runs them (both in the PR):
  `supabase secrets set IMPORT_EVENTS_ENABLED=true --project-ref mkegtssedjyqldysvzga`
  and `npx wrangler pages secret put VITE_IMPORT_EVENTS_ENABLED --project-name plot`
  (value `true`). Then confirm by digest comparison only.
- Savannah: review and merge the PR.
- After merge: `supabase functions deploy import-worker` (production, needs her OK).
- Mobile's next build needs `EXPO_PUBLIC_IMPORT_EVENTS_ENABLED=true`.
- Show ratings (`IMPORT_ANNOTATIONS_ENABLED`) stay off; not asked for.
- Delete this file in the last commit before merge.
