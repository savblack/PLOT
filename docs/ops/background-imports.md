# Background imports

Watch-history imports run as `import_jobs` rows worked by the `import-worker`
edge function, so a user can start an import during onboarding (or anywhere)
and carry on using the app. Shipped 2026-10 (migration `20261015090000`).

## How it runs

1. The app uploads the export to the private `import-uploads` bucket at
   `<user id>/<job id>/<file name>` and calls `enqueue_file_import_job`
   (`packages/core/importJobs.js`). A connection source (Trakt, Plex, Simkl)
   calls `enqueue_connection_import_job` instead. One open job per account.
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
   for good; `_review.json` stays until the user deletes their account.

The parse / match / plan / write code is the apps' own pipeline, bundled from
`packages/core/importEngine.js` into
`supabase/functions/_shared/importEngine.generated.js` by
`scripts/build-import-engine.mjs`. `pnpm run lint` fails when the bundle is
stale; run `pnpm run import-engine` after touching the import pipeline.

## Deploying

- The migration applies to production on merge. It creates the bucket, the
  table, the RPCs and the cron entry.
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
