# tmdb-import

Status: paused (PR open: https://github.com/savblack/PLOT/pull/1796, Auto-fix
on; verified end to end on web/Staging; iPhone untested; not merged.)
CI note: `colors:check` runs in CI ("Check generated and shared sources"),
not in local `pnpm run check`. The TMDB icon brand colours are recorded in
`scripts/color-literal-baseline.json` (both ImportSourceIcon files 8 → 10).
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
  `20261120100000_import_jobs_tmdb_source.sql` (renumbered 2026-11-20 from
  20261119100000, which main's episode_airings (#1791) also used; incident
  #1794). Needs `.env` sourced first.
- Second-agent review (2026-11-19): nothing serious. Fixed: (1) TMDB
  `request_token` now redacted from analytics (`utils/redactUrl.js`) and
  wiped from the address bar on `/auth/tmdb`; (2) token bound to the Plot
  account server side (`tmdbTokenBinding`, HMAC with the service key);
  (3) only TMDB codes 6/17/33 say "not approved", others "unavailable";
  (4) 90s read budget so the TMDB session is always deleted; (5) exact-ID
  lookups retried once. Not changed: (6) a free account at its custom-list
  cap gets list rows refused (same as Letterboxd lists); (7) iPhone
  `plot://auth/tmdb` redirect still untested.
- Staging (2026-11-19, Savannah's yes): migration applied by hand in one
  transaction and recorded in `supabase_migrations.schema_migrations`
  (version 20261119100000; the "Plot nightly migration check failure"
  session moved Staging's ledger row to 20261120100000 on 2026-11-20 and
  applied main's two 20261119 migrations). `db:drift` reported
  `import_jobs_source_check` differs Staging vs production; expected until
  merge. `tmdb-account` and `import-worker` deployed to PLOT Staging.
  Staging has TMDB_API_KEY, IMPORT_EVENTS/ANNOTATIONS_ENABLED, SB_SECRET_KEY.
  Local web: launch config `web-tmdb-import` (localhost:5197, main checkout's
  `.claude/launch.json`, gitignored).
- End-to-end so far (2026-11-19, localhost:5197 on Staging): TMDB tile shows
  in Settings › Add a source; its sheet shows the reads copy; "Continue to
  TMDB" calls `tmdb-account` start on Staging and lands on
  `themoviedb.org/authenticate/<token>?redirect_to=http://localhost:5197/auth/tmdb`,
  which names Plot. Note: TMDB's own wording says "read and write"; Plot only
  reads, and ends the session.
- Savannah approved on TMDB (2026-11-19). TMDB redirected to
  `/auth/tmdb`, the token check passed, `fetch` returned 200 (no
  not_approved/unavailable), and the callback showed `tmdbEmpty` ("no
  watchlist, lists or ratings"). So sign-in, binding, session and account
  read all work against real TMDB. Unknown: whether the account really is
  empty or an endpoint read came back empty. Response not captured (browser
  buffer dropped it). Savannah confirmed the account is empty, so the
  empty result is correct.
- Run 2 (2026-11-19, job 1f980bdc on Staging): succeeded, 3 imported, 0
  failed. Landed: Red Desert watched (history rating 8, watched_at null,
  watch_events source_rating 8, precision unknown); Severance show rating as
  annotation `{rating: 9, sourceRating: 9}`; private TMDB list "Plot import
  test" created (imported_lists tmdb:list:8717509), so v3 DOES return
  private lists with a session. Watchlist and episode rating came back empty
  because they had not actually saved on TMDB (TMDB pages confirmed empty).
  Fixed on TMDB; run 3 pending Savannah's Approve.
- TMDB's website rates in whole points only (movies/shows 0-100 in 10s,
  episodes 5 stars with halves = whole points/10). Half points cannot be
  made there; covered by unit tests only.
- Run 3 (2026-11-20, job c1cb7b90): succeeded, total 6, imported 3,
  duplicates 3, failed 0. Watchlist has Red Desert + Severance; private
  list "Plot import test" has Red Desert; annotations: show 9 and episode
  S1E2 8, each with sourceRating; one watch event (no double). Re-import
  adds nothing twice. END TO END VERIFIED ON WEB.
- Fixed after run 2: Settings › TMDB detail had no way to import again
  (TMDB is connect-lane but never "connected"); added "Import from TMDB
  again" on web and iPhone (`settingsView.sources.importTmdbAgain`). Verified
  on web: that button reached TMDB's approval page for run 3.
- Fixed: shared queued copy now says "import" not "history"
  (`copy/importJobs.js`), so it is accurate for TMDB; affects every source.
  `tests/smoke/settings-sources.spec.js` updated; full smoke suite 131
  passed / 7 skipped. `staging:test -- all` (CI runs it on the PR).

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
