# Title index write throttle

Status: ready for review. Draft pull request only. Do not merge.

## Plain version

Public movie and TV pages were rewriting a "last seen" time on every visit. That was the heaviest writing on the small free database. A title is now saved the first time, and again only if it has not been saved in the last day or its name changed. The sitemap still works. Merging would change the live database, so this waits for a yes.

## Record

- Goal: stop `title-page` from upserting `title_page_index.last_seen_at` on every render.
- Owner: Jacob. Reliability of the web app and the database.
- Branch: `cursor/title-page-index-daily-write-7b6e`
- Worktree: `/workspace` (cloud agent checkout, not a sibling worktree)
- Latest commit: head of `cursor/title-page-index-daily-write-7b6e` (the commit that adds `record_title_page_index`)
- Migration: yes, additive. `supabase/migrations/20261102120000_title_page_index_seen_throttle.sql` adds `record_title_page_index(jsonb)`. No table change. Merging to `main` applies it to production and redeploys edge functions. Not applied. Not deployed.
- Completed: conditional upsert (insert, or update when `last_seen_at` is older than 24 hours or `title` changed). Page response still uses `EdgeRuntime.waitUntil`. Only reader of this `last_seen_at` is the daily titles sitemap. No reader needs a fresher clock.
- Evidence: `scripts/tests/titlePageIndexWrite.test.mjs` passed on local Postgres 17, including an unchanged `ctid` and unchanged `n_tup_upd` on a repeat inside 24 hours. `pnpm run edge:check` passed (39 functions, 108 shared tests). `pnpm run check` passed. `pnpm run migrations:check` and `pnpm run db:block-clause` passed. Web unit tests 536 passed. Core unit tests 1187 passed.
- Next action: review the draft PR. Do not merge until Savannah says the production migration is OK. Delete this file in the last commit before merge.
- Blockers: none for review. Merge is the production change.
- Approvals already given: none for production.
- Approvals still needed: Savannah, before merge.
- Last updated: 2026-11-02T04:11:07Z
