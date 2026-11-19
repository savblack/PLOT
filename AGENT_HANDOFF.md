# tmdb-import

Status: paused (built and checked locally; waiting on Savannah for Staging
deploys and a real TMDB sign-in test)
Owner: Claude Code (desktop session)
Branch: agent/2026-11-18-tmdb-import
Worktree: ~/Developer/PLOT-worktrees/2026-11-18-tmdb-import
Latest pushed commit: see `git log -1` (review fixes, [skip ci])
Updated: 2026-11-19

## In plain words

The TMDB import is built on web and iPhone. Someone picks TMDB in the import
picker, approves Plot on TMDB's own page, and Plot brings over their
watchlist, their own lists and their ratings. Rated movies count as watched.
Ratings with half points are rounded for Plot's stars and the exact TMDB score
is kept. It passes every local check. It has NOT been tried with a real TMDB
account yet. That needs Savannah's OK to put it on Staging (Plot's test copy),
and someone signed in to TMDB to press Approve.

## Checks

- `pnpm run check`: pass (0 errors; warnings are the existing backlog).
- `pnpm run test:unit`: pass (645 + 1495 (+1 skipped) + 99), after review fixes.
- `pnpm --filter @plot/mobile run typecheck`: pass.
- `pnpm run edge:check`: pass (40 functions, `_shared` tests incl. new
  `tmdbAccount.test.ts`).
- `migrations:check`, `migrations:contract`: pass.
- `db:migration-test` (production copy): pass for
  `20261119100000_import_jobs_tmdb_source.sql`. Needs `.env` sourced first.
- Second-agent review (2026-11-19): nothing serious. Fixed: (1) TMDB
  `request_token` now redacted from analytics (`utils/redactUrl.js`) and
  wiped from the address bar on `/auth/tmdb`; (2) token bound to the Plot
  account server side (`tmdbTokenBinding`, HMAC with the service key);
  (3) only TMDB codes 6/17/33 say "not approved", others "unavailable";
  (4) 90s read budget so the TMDB session is always deleted; (5) exact-ID
  lookups retried once. Not changed: (6) a free account at its custom-list
  cap gets list rows refused (same as Letterboxd lists); (7) iPhone
  `plot://auth/tmdb` redirect still untested.
- Pending: `db:drift`, `staging:test -- all` (CI runs it on the PR),
  real TMDB sign-in on Staging.

## What was built (evidence: commits 84e142b81, 1d743271a)

- Migration: 'tmdb' added to `import_jobs_source_check`.
- `supabase/functions/tmdb-account`: `start` (request token + approve URL,
  redirect allowlist in `_shared/tmdbAccount.ts`), `fetch` (session, account,
  watchlist movies/tv, rated movies/tv/episodes, own lists + items, session
  deleted in `finally`). Stores nothing. `config.toml` verify_jwt = true.
- Core: `tmdbAccountImport.js` (parser, rounding, report reasons),
  `tmdbAccount.js` (client flow), `importDocument.js` (routing + leaves out
  lists/annotations when a build has them off), `importPipeline.js`
  (`getTitle` path for `tmdbRef`; title/poster/genres come from TMDB, not
  the file), copy in `copy/importView.js` and `copy/onboardingFlow.js`,
  source in `onboardingSetup.js` and `importJobs.js`.
- Worker: `getTitle` in `tmdbDeps`; bundle regenerated.
- Web: TMDB tile/icon, `useImportStart` branch, `/auth/tmdb` callback page,
  token check in `utils/redirects.js` (rejects any token this tab did not ask
  for, so a crafted link cannot import someone else's account).
- iPhone: `useImportStart.ts` uses `WebBrowser.openAuthSessionAsync` with
  `plot://auth/tmdb`, same token check. Icon.
- Analytics: existing import events with `source: 'tmdb'`; no new event.

## Not yet verified (open questions)

- TMDB's approval page with a real account, and that it sends people back
  to `/auth/tmdb` and to `plot://auth/tmdb` (iPhone) with
  `request_token` and `approved=true`.
- Whether `/3/list/{id}` returns PRIVATE lists with a session_id (v3 may
  only return public lists).
- Whether `/3/list/{id}` pages its `items` (code handles `total_pages` if
  present).

## Next action

With Savannah's OK: on Staging, apply the migration, deploy `tmdb-account`
and `import-worker` (`pnpm run supabase:staging -- functions deploy <name>
--yes`), run `pnpm run dev`, pick TMDB, have Savannah approve on TMDB's page,
and check the job finishes and the titles land. Then address review
findings, remove this file, open the PR (not merged without her say).

## Approvals

- Given: build a one-time TMDB import (2026-11-19).
- Given: the database change (2026-11-19, "go ahead and build it").
- Given: rated TMDB movie counts as watched, date unknown (2026-11-19).
- Given: half-point scores round for Plot, exact score kept (2026-11-19).
- Needed: OK to deploy to Staging; a TMDB sign-in for the test.
