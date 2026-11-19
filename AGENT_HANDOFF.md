# 2026-11-19-episode-air-times

**In plain words:** Plot is starting to collect the exact minute each followed episode
airs, from TVmaze (a free TV database), so it can later show those times and alert
people when an episode drops. This first part only collects times. Nobody sees a
change yet. Savannah needs to approve the merge, because merging applies a database
change to the live database.

Status: active
Owner: Hailey (product) with Jacob (build)
Branch: agent/2026-11-19-episode-air-times
Worktree: ~/Developer/PLOT-worktrees/2026-11-19-episode-air-times
Updated: 2026-11-19

## Goal

Phase 1 of exact episode drop times. Decisions and phases: `docs/features/episode-drop-times.md`.

## Done

- `supabase/migrations/20261119100000_episode_airings.sql`: `tvmaze_show_links`
  (service-only), `episode_airings` (public read), `run_episode_air_times()`, cron
  `episode-air-times` at :40 hourly.
- `supabase/functions/episode-air-times/index.ts` and `_shared/episodeAirings.js`;
  tests in `apps/web/tests/unit/episodeAirings.test.js` (13 pass).
- `supabase/config.toml` entry; types hand-added to `_shared/database.types.ts`.

## Checks

- Passed: `pnpm run check`, `pnpm run test:unit`, `pnpm run edge:check`,
  `migrations:check`, `migrations:contract`, `db:block-clause`. Live TVmaze run of
  the rules on five shows matched expectations.
- Second-agent review done. Fixed: change columns wiped by batch upserts;
  withdrawn (TBA, renumbered) episodes left with stale times; no per-call
  timeout; failure rate understated outages; missing deny-all policy.
- Pending: `pnpm run db:migration-test` (production DB password not in `.env`),
  `db:drift`, CI `staging-tests` on the PR.

## Known limits (for phase 2 and 3)

- Rows are keyed by TVmaze's season and episode numbers under the TMDB id. Some
  shows number differently (year seasons, anime). Phase 2 must match a row to
  TMDB's episode only when their dates agree within a day.
- Linking does 40 shows an hour, so a backlog of 2,000 followed shows takes about
  two days to link. Syncing keeps up with about 13,000 linked shows.
- `episode_airings` is public, so it reveals which shows at least one Plot user
  follows (no user ids). Accepted as schedule data.

## Approvals

- Given: build phase 1 (2026-11-19).
- Needed: merge (applies migration to production).

## Next

Savannah approves the merge (it applies the database change to production). Then phase 2 (display) on a new branch. Delete this file in the last commit before merge.
