# profile-badge-insert-guard

Status: active
Branch: agent/2026-11-18-profile-badge-insert-guard
Worktree: ~/Developer/PLOT-worktrees/2026-11-18-profile-badge-insert-guard
Owner: Jacob (security), via a Claude Code session
Updated: 2026-11-18

## In plain words

The database already stops people giving themselves the Premium or supporter badge when they edit their profile. This adds the same check for when a profile is first created. Nobody can hit that gap today, so nothing changes for users. It waits for Savannah's OK to merge.

## Changes

- `supabase/migrations/20261118140000_premium_flag_insert_guard.sql`: a new BEFORE INSERT trigger with the same claims rules as `protect_premium_flag`. The live update guard is not recreated.
- `scripts/staging-premium-flag-test.sql`: adds insert cases for each flag, the ordinary insert, and the service role.

## Checks

All passed:
- `staging:test -- premium-flag`: 11/11. Without the fix, the 2 original insert cases FAIL.
- `db:migration-test`
- `db:drift`
- `migrations:check`
- `migrations:contract`
- `db:block-clause`
- `pnpm run check`

`staging:test -- all`: 31/32. The `block` test also fails on main. The cause is leftover Staging fixture data: an accepted A<->B follow plus 2 notifications, created at 11:58 today by something outside this work. It is not caused by this branch.

A second agent reviewed the change and found no broken path. Its only valid suggestions were the extra Ko-fi-date and service-role cases, which are added.

## Next

1. Get Savannah's OK to merge, and remove this file in the last commit first.
