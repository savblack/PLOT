# 2026-11-11-import-rejections

Status: paused (PR open, waiting for Savannah's review)
Owner: Jacob (CTO lane), run from a Claude Code side session
Branch: agent/2026-11-10-2026-11-11-import-rejections
Worktree: ~/Developer/PLOT-worktrees/2026-11-10-2026-11-11-import-rejections
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
- IMDb list files: watchlist recognised past copy markers ("watchlist (1).csv");
  with the event importer off, every IMDb list gets one clear message.
- Letterboxd: "watched (1).csv", "Watched 2.csv", "letterboxd-…-watched.csv"
  now import. A name that says neither is refused with a pointer to the .zip.

## Next

- Savannah: review and merge the PR.
- After merge: `supabase functions deploy import-worker` (production, needs her OK).
- Decision for Savannah: whether to switch on list imports in production
  (`IMPORT_EVENTS_ENABLED` plus the app flags). Not done here.
- Delete this file in the last commit before merge.

## Unknowns

- I asked the parent session for the six stored file names. No answer yet.
