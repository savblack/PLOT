# Delete account: stop billing and clean up storage

Status: paused (checkpoint, unfinished)
Branch: agent/delete-account-history-board-1012a
Worktree: /Users/savannahblack/Developer/PLOT-worktrees/delete-account-history-board-1012a-dev
Owner: Jacob (CTO) / Savannah approves
Updated: 2026-11-03

## In plain words

Today, deleting a Plot account on `main` does not cancel the person's Stripe subscription, so they could keep being billed. It also leaves their profile photos behind. This branch fixes both. It is not safe to merge yet: it has not been tested against Staging or the migration test.

## What changed

- `supabase/functions/delete-account/billingCleanup.js` (new): cancels the account's Stripe subscriptions and expires any open checkout before deletion. If Stripe fails, deletion stops with a 503.
- `supabase/functions/delete-account/index.ts`: runs billing cleanup first, removes profile photos, runs row cleanup with the service role, keeps main's import-upload removal.
- `supabase/functions/delete-account/cleanup.js`: `removeAvatarObjects`; `history_board` is optional if the table is missing.
- `supabase/functions/stripe-webhook/index.ts`: ignores events for accounts already deleted.
- `packages/core/copy/settingsView.js`: dialog says the subscription is canceled immediately.
- `supabase/migrations/20261103130000_feedback_attachment_owner_select.sql` (new): lets owners read their own feedback attachments, which storage deletion needs. Renamed from 20261012113449 so it sorts after main's latest migration.
- Tests: `deleteAccountCleanup.test.js`, `deleteAccountBillingCleanup.test.js`.

## Verified (Node 25.7 locally; CI uses 22)

- 10 of 10 delete-account tests pass.
- `pnpm run edge:check`: 39 functions typecheck and lint clean.
- `pnpm run migrations:check`: clean.
- `pnpm run check`: build completed.

## Next action

1. Rerun `pnpm run check` on Node 22 and read the lint section.
2. `pnpm run db:migration-test` (needs Production DB copy credentials; Savannah must approve).
3. Test the Stripe cancel path and the delete flow on PLOT Staging with Stripe test data.
4. Ask a different agent to read the diff (billing and permissions), then open the PR.
5. Delete this file in the last commit before merge.

## Approvals

- Given: checkpoint commit and push of this branch (2026-11-03).
- Still needed: Production credentials for migration test; merge (migration applies to Production on merge); any Staging write.

## Blockers

None known. Rebased onto origin/main on 2026-11-03 with one conflict (index.ts), resolved by keeping both sides.
