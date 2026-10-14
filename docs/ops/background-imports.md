# Background imports

Watch-history imports run as `import_jobs` rows worked by the `import-worker`
edge function, so a user can start an import during onboarding (or anywhere)
and carry on using the app. Shipped 2026-10 (migration `20261015090000`).

## How it runs

1. The app uploads the export to the private `import-uploads` bucket at
   `<user id>/<job id>/<file name>` and calls `enqueue_file_import_job`
   (`packages/core/importJobs.js`). A connection source (Trakt, Plex, Simkl)
   calls `enqueue_connection_import_job` instead. Jobs queue (migration
   `20261016090000`): a second source picked while one runs waits behind it,
   one open job per source, at most ten open per account. The worker still
   runs one job per account at a time (`claim_import_job` skips an account
   with a job under a live lease), because the planner reads existing history
   before it writes.
2. The app nudges `import-worker` with the user's own JWT, and `pg_cron` calls
   it every minute via `run_import_worker_tick` (Vault bearer, like the alert
   jobs) while any job is due.
3. The worker claims a job under a 3 minute lease and runs it in slices:
   `parse` (core's `readImportSelection`, entries saved as `_entries.json`),
   `resolve` (100 titles per slice against TMDB, `_resolved.json`), then
   `write` (core's planner and writers through an injected service-role
   client). Each slice checkpoints the row; a timed-out run resumes.
4. Anything the preview would have asked about (no confident match, a possible
   duplicate) is not written. It is saved as `_review.json` and the Home card
   offers "Finish matching", which opens the import page's preview on exactly
   those entries (`/import?job=<id>`).
5. Uploads and intermediate files are deleted when the job finishes or fails
   for good. `_review.json` is removed when the user finishes the review
   (`finishImportJobReview`, which also zeroes `review_count`), swept by the
   worker after 30 days (`run_import_review_sweep`, daily cron, posts
   `{"action":"sweep"}` with the Vault bearer), and cleared with the rest of
   the user's `import-uploads` folder by `delete-account`.

Plex: the worker needs a server and profile on the integration. The
onboarding panel (web and mobile) lists them once Plex is connected, and
`usePlexSource(userId, { autoPick: true })` picks the only server and the only
profile itself, so most people never see the chips.

Web only: a blocked Trakt popup sends the tab to Trakt instead. The step-one
picks are parked in sessionStorage (`utils/onboardingStash.js`) on the way out
and restored when `?import=trakt` brings the flow back.

The parse / match / plan / write code is the apps' own pipeline, bundled from
`packages/core/importEngine.js` into
`supabase/functions/_shared/importEngine.generated.js` by
`scripts/build-import-engine.mjs`. `pnpm run lint` fails when the bundle is
stale; run `pnpm run import-engine` after touching the import pipeline.

## Where imports start

- Onboarding's switching-apps step (`apps/web/src/pages/OnboardingScreen.jsx`):
  two lanes of source tiles (`components/ImportSourceLanes.jsx`), a sheet or
  dialog per source (`components/ImportSourceDialog.jsx`), state in
  `hooks/useImportStart.js`. A second pick queues; the pill above the next
  steps and the first line of the building moment follow the running job.
- Settings › Connections › Your sources (`components/SettingsSources.jsx`):
  one row per connected account or file source with a job in the last 90
  days (`readImportJobs(userId, { history: true })`), a detail per source
  (history, automatic toggle, import again, remove), and "Add a source",
  which opens the same lanes and dialog. The old Integrations group and the
  flagged Watch tracking block are gone; `useTrackingJobs` still feeds the
  automatic toggle and duplicate reviews from the detail.
- Home's card (`components/ImportJobCard.jsx`) shows the running job (with
  what waits behind it) and every finished job not yet dismissed.
- A same-tab OAuth round trip (Simkl, or Trakt with the popup blocked) comes
  back as `?import=<source>` on the page it left, which reopens the dialog.
  Trakt and Simkl jobs carry `entry` = `onboarding`, `settings` or
  `import_page`.

## Deploying

- The migrations apply to production on merge. They create the bucket, the
  table, the RPCs and the two cron entries (worker tick, daily review sweep).
- Deploy the function: `supabase functions deploy import-worker`. It is
  declared in `config.toml` with `verify_jwt = false` (it verifies the service
  bearer or the user JWT itself).
- Secrets the function reads: `TMDB_API_KEY` (already set for `tmdb-proxy`),
  and the flags the apps read as `VITE_IMPORT_EVENTS_ENABLED` /
  `VITE_IMPORT_ANNOTATIONS_ENABLED`: set `IMPORT_EVENTS_ENABLED` and
  `IMPORT_ANNOTATIONS_ENABLED` to the same values on the project, or a
  background import will take the legacy title-summary path while the page
  takes the event path. `TVTIME_IMPORT_ENABLED` likewise.
- The cron needs the Vault secrets `edge_webhook_bearer` and
  `edge_webhook_base_url` that the alert jobs already use.
- `trakt-sync`, `media-sync` and `simkl-sync` gained an internal mode (service
  bearer plus `user_id`) for the worker; redeploy them too.

## Watching it

`select id, user_id, source, status, phase, progress_done, progress_total,
imported, review_count, last_error, attempts from public.import_jobs order by
created_at desc limit 20;`

A job in `retry_wait` retries with backoff up to five attempts, then `failed`
with `last_error` shown on the Home card. `cancelled` is the user's Cancel.
