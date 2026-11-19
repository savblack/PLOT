# tmdb-import

Status: paused (waiting on Savannah: database change + two product choices)
Owner: Claude Code (desktop session)
Branch: agent/2026-11-18-tmdb-import
Worktree: ~/Developer/PLOT-worktrees/2026-11-18-tmdb-import
Latest pushed commit: none yet (branch cut from origin/main at aa961c92b)
Checks: none run yet (no code changed)
Updated: 2026-11-19 (plan double-checked against the code)

## In plain words

Goal: let someone bring their TMDB watchlist, lists and ratings into Plot by
signing in to TMDB once. TMDB has no watch history. Nothing is built yet.
Waiting on Savannah for: (1) yes to one small database change, (2) what to do
with half-point ratings, (3) whether a rated movie counts as watched.

## Findings (evidence)

- Every import is a background job (`packages/core/importJobs.js`,
  `supabase/functions/import-worker/index.ts`). `import_jobs.source` has an
  inline check listing allowed sources
  (`supabase/migrations/20261015090000_import_jobs.sql:58`). Adding 'tmdb'
  needs a migration that drops and re-adds that check with 'tmdb' added. The
  enqueue RPCs need no change: `enqueue_file_import_job` (latest body in
  `20261111090000_import_jobs_global_cap.sql`) only refuses the connection
  sources. No function is redefined.
- Production switches: `IMPORT_EVENTS_ENABLED` and `IMPORT_ANNOTATIONS_ENABLED`
  are on for the worker and web since 2026-11-11 (`docs/ops/background-imports.md:91`).
  They gate BOTH list/watchlist writes (`importLists.js`) and ratings
  (`importAnnotations.js`, `importPipeline.js:425`). Mobile store builds need
  the EAS env vars, but the worker does the writes. Imported show/episode
  ratings land in `imported_annotations` + data export; no screen shows them.
- Ratings: `history.rating` and annotation ratings must be whole 1-10
  (`20260925150000_history_rating_range.sql`, `20260917130000_imported_annotations.sql:41`).
  TMDB allows half points (7.5). Needs a decision.
- IMDb precedent (`importParsing.js:461`, `importPipeline.js:451`): a rated
  MOVIE becomes a watched title with unknown date and that rating; a rated
  SHOW becomes a private annotation. Annotation scopes allow movie/show/season/episode.
- Matching: `resolveImportEntries` (`importPipeline.js`) always searches by
  title or external ID. `chooseImportMatch` takes a candidate object; a TMDB
  entry can pass its candidate directly. Do NOT trust title/poster from the
  uploaded file (the person uploads it, so they could edit it): the worker
  should look each ID up via TMDB (`/movie/{id}`, `/tv/{id}`) and use that as
  the candidate. Add a `getTitle` dep to `tmdbDeps` in the worker.
- Upload: the app must upload the JSON itself. `enqueue_file_import_job`
  checks `owner_id = uid` on the storage object, so a service-role upload by
  the edge function would be refused.
- Auth: `TMDB_API_KEY` is a v3 key; v4 auth rejects it (code 7). v3 flow:
  `GET /3/authentication/token/new` (works, 60 min) → user approves at
  `https://www.themoviedb.org/authenticate/{token}?redirect_to=…` →
  `POST /3/authentication/session/new` (unapproved gives code 17, checked) →
  `GET /3/account` → read → `DELETE /3/authentication/session`.
  NOT yet tested: the approval page with a real TMDB account in a browser
  (curl got 401), and whether `redirect_to` accepts the app scheme
  `plot://auth/tmdb` (Simkl uses `plot://auth/simkl`, handled in
  `apps/mobile/app/_layout.tsx:335`). Test both first.
- Known limit of TMDB's v3 flow: whoever holds the request token can read
  the account once the person approves it. Someone could send a Plot user an
  approve link for a token they made. Exposure is read-only TMDB watchlist,
  lists and ratings, and needs the victim to click Approve on TMDB's page
  naming Plot. Cannot be closed on Plot's side; note it in the PR.
- Analytics: no new event. The existing import events (`reportImport`,
  `analyticsEvents.js:238`) carry `{ source }`; use `source: 'tmdb'`.
- Web redirect has no host allowlist (`apps/web/src/utils/redirects.js:139`).

## Plan

1. Migration: re-create `import_jobs_source_check` with 'tmdb' added. Read
   `docs/ops/migrations.md`; run `db:migration-test`, `db:drift`,
   `migrations:check`, `migrations:contract`, `staging:test -- all`.
   Second-agent review before PR.
2. Edge function `supabase/functions/tmdb-account` (verify user JWT):
   `start` → `{ approveUrl, requestToken }`; `fetch` → session, `/3/account`,
   watchlist movies+tv, rated movies+tv+tv/episodes, lists + `/3/list/{id}`,
   paginated with a page cap, revoke session in `finally`, return JSON.
   Stores nothing. `pnpm run edge:check`.
3. Core: `parseTmdbAccount` (ids + media type + rating + list membership
   only), wired into `parseImportDocument`/`parsePlatform`; resolver path for
   entries with `tmdbId` that looks the ID up and passes it as the candidate;
   'tmdb' in `IMPORT_SOURCE_NAMES` and `onboardingSetup.js` (new lane or
   connect lane with special start); regenerate the import engine bundle
   (`scripts/build-import-engine.mjs`). Unit tests.
4. Worker: `getTitle` in `tmdbDeps`.
5. Web: picker tile, `/auth/tmdb` callback route, `useImportStart` branch
   (connect → fetch → upload → enqueue). Mobile: same in
   `ImportHistoryModal`, deep link in `_layout.tsx`. Copy in
   `packages/core/copy`. Import screen must say TMDB has no watch history.
6. `pnpm run check`, `test:unit`, mobile typecheck, `edge:check`.

## Next action

Wait for Savannah's answers, then start at step 2's sign-in test (approval
page + app redirect) before writing the migration.

## Approvals

- Given: build a one-time TMDB import (2026-11-19).
- Given: a rated TMDB movie counts as watched, date unknown (2026-11-19).
- Needed: the database change.
- Half-point TMDB ratings: Plot has half STARS (`packages/core/ratings.js`:
  5 stars stored 1-10, one point = half a star), so a TMDB 7.5/10 (3.75
  stars) cannot be shown. Proposed (no schema change): Plot's own rating is
  rounded to the nearest whole point, and the exact TMDB score is kept too:
  - rated movie: `watch_events.source_rating` is `numeric` 0-10, takes 7.5
    as is (`20260916150000_import_watch_events.sql`); `history.rating` gets
    the rounded value. Set `source_rating` from an exact field, not
    `record.rating` (`importEvents.js:73`), and pass the rounded value in
    the summary rather than relying on Postgres `::integer` rounding.
  - rated show/episode: `import_saved_annotations` checks only that
    `annotation.rating` is whole and stores the whole `annotation` jsonb, so
    add the exact score as an extra key (e.g. `sourceRating`).
  Both tables are in the data export (`export-user-data/collect.js:13,20`).
  Not shown on any screen yet. Waiting on her yes.
