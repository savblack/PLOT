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
- Pending: `pnpm run db:migration-test` (production DB password not in `.env`),
  `db:drift`, CI `staging-tests`. Second-agent review of the diff requested.

## Approvals

- Given: build phase 1 (2026-11-19).
- Needed: merge (applies migration to production).

## Next

Address review findings, open the PR, then phase 2 (display) on a new branch.
