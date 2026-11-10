# import-scaling

Status: active
Branch: agent/2026-11-10-import-scaling
Worktree: ~/Developer/PLOT-worktrees/2026-11-10-import-scaling
Updated: 2026-11-11 (Claude Code)
Owner: Jacob (reliability)

## Plain English
Imports now take turns. At most 3 run at the same time across all of Plot, and the rest wait for a free slot. Uploading the same file again while it is still importing is refused with a short message. Measurements show imports were not what slowed production on 2026-11-10: that account's six imports all stopped while reading the file and never wrote anything. This is protection for when many people import at once.

## Change
- `supabase/migrations/20261111090000_import_jobs_global_cap.sql`: cap of 3 running jobs in `claim_import_job`; `content_hash` column + partial unique index; `enqueue_file_import_job` gains `p_content_hash` (drop + recreate, 4-arg callers still resolve).
- `packages/core/importJobs.js`: `importFileFingerprint` (SHA-256 of name + bytes), pre-upload check, `import_duplicate` message, PGRST202 fallback for a database without the migration.
- `packages/core/copy/importJobs.js`: `onboarding.alreadyImporting`.
- `scripts/staging-import-cap-test.sql` + `staging:import-cap-test`.
- `supabase/functions/_shared/database.types.ts`: `content_hash` on import_jobs (hand-added; prod schema lacks it until merge).

## Evidence
- Restored copy of production (local, torn down): 2,348-title write = 48 statements, 68 ms, 2.0 MB WAL, 2,348 history + 2,348 feed_posts rows. 100-title slice = 6 ms, 83 kB. Same file again = 10 ms, 7 kB. Triggers per history row: feed_post_from_history (~18 µs), brevo_mark_dirty (~4 µs). No follower fan-out.
- Production import_jobs: 6 rows, all failed in parse within 3-12 s (filename/format errors). None reached resolve or write.
- Cap: 12 back-to-back claims, before 12 running, after 3. 12 simultaneous claims (dblink), after: 3 claimed, 9 refused.
- Staging `staging:import-cap-test`: REPRO (live runs all 4), then 9/9 PASS incl. oldest-first fairness, rolled back.
- Review agent: nothing blocking; flagged that open apps could starve closed-app users. Fixed: a nudge takes the longest-waiting job first; the worker reports nothing about another user's job (`supabase/functions/import-worker/index.ts`).
- check, test:unit, edge:check, migrations:check, db:block-clause, copy:check, core:check, db:drift, db:migration-test: pass. db:function-diff: only the `declare` line reformatted.

## Skipped (and why)
- Batching writes: already batched 50 rows per request (WRITE_BATCH).
- Skipping feed posts for imports: one feed post per title, ~18 µs each; not a measured cost, and it would change what users see.

## Approvals
- Still needed: Savannah's yes to merge (migration applies to production on merge), and to deploy `import-worker` (`supabase functions deploy import-worker`) right after.

## Next
See PR. Delete this file before merge.
