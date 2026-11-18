# avatar-delete-rule

Status: active
Branch: agent/2026-11-18-avatar-delete-rule
Worktree: ~/Developer/PLOT-worktrees/2026-11-18-avatar-delete-rule
Owner: Jacob (security), via a Claude Code session
Updated: 2026-11-18

## In plain words

"Remove photo" didn't actually delete the old picture, because the database had no rule letting people delete their own avatar files. This adds that rule, limited to each person's own folder. Waits for Savannah's OK to merge, because the change goes to production on merge.

## Changes

- `supabase/migrations/20261118120000_avatars_owner_delete.sql`: an owner-only DELETE policy on the avatars bucket.
- `scripts/staging-avatar-access-test.sql`: a new Staging test checking the owner, another user, anon and the delete policy.

## Checks

All passed:
- `staging:test -- avatar-access` (5/5)
- `staging:test -- all` (32/32)
- `db:migration-test`
- `migrations:check`
- `migrations:contract`
- `db:block-clause`
- `pnpm run check`

`db:drift` fails for a reason that predates this branch: Staging never got 20261118100000, which merged in #1762. Fixing that needs a deliberate apply on Staging plus a ledger record, and waits for Savannah's OK.

## Next

1. Get Savannah's OK to merge, and remove this file in the last commit first.
2. Optionally apply 20261118100000 to Staging and record it in its migration ledger.
