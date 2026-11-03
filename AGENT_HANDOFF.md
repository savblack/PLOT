# Delete account: stop billing and clean up storage

Status: paused (draft PR open, all checks passed, waiting on merge approval)
Branch: agent/delete-account-history-board-1012a
Worktree: /Users/savannahblack/Developer/PLOT-worktrees/delete-account-history-board-1012a-dev
Owner: Jacob (CTO) / Savannah approves
Updated: 2026-11-03

## In plain words

Today, deleting a Plot account on `main` does not cancel the person's Stripe subscription, so they could keep being billed. It also leaves their profile photos behind. This branch fixes both. Every check has passed, including the migration test against a copy of production. It is waiting only on Savannah's OK to merge.

## What changed

- `supabase/functions/delete-account/billingCleanup.js` (new): cancels the account's Stripe subscriptions and expires any open checkout. A checkout session Stripe no longer has is skipped. If Stripe fails, deletion stops with a 503.
- `supabase/functions/delete-account/index.ts`: storage cleanup (feedback files, import files, profile photos) runs first, then billing, then rows with the service role, then the auth user. Billing goes last among the steps that can fail, so a failed attempt never leaves a live account with its subscription already canceled.
- `supabase/functions/delete-account/cleanup.js`: `removeAvatarObjects` walks subfolders, caps passes, and stops if storage reports success but removes nothing. `history_board` is optional if the table is missing.
- `supabase/functions/stripe-webhook/index.ts`: ignores events for deleted accounts; logs an error if a live subscription turns up for one, so it can be canceled by hand.
- `packages/core/copy/settingsView.js`: dialog says the subscription is canceled immediately.
- `supabase/migrations/20261103130000_feedback_attachment_owner_select.sql` (new, idempotent): owners can read their own feedback attachment metadata, which storage deletion needs.
- `scripts/staging-feedback-attachment-owner-test.sql` + `staging:feedback-attachment-owner-test` script.
- Tests: `deleteAccountCleanup.test.js`, `deleteAccountBillingCleanup.test.js`.

## Independent review (2026-11-03)

A separate agent found no way to reach another user's data or subscription. Fixed from its findings: billing order, avatar subfolders blocking deletion, avatar loop risk, missing checkout session blocking deletion, silent live subscription on a deleted account, non-idempotent migration. Not changed: service-role cleanup of `user_custom_list_items` also removes the user's items in others' lists, which the `user_id` FK already cascades on auth deletion (20260801000001), so the outcome is unchanged.

## Verified (Node 22.23.4)

- 13 of 13 delete-account unit tests pass.
- `pnpm run check`: exit 0 (existing lint warnings only).
- `pnpm run edge:check`: 39 functions typecheck and lint clean.
- `pnpm run migrations:check`: clean.
- `pnpm run staging:feedback-attachment-owner-test`: 6 of 6 on Staging (owner, bystander, anonymous, re-apply), rolled back.
- `pnpm run db:migration-test` (run by Savannah, 2026-11-03): production at 174 migrations; the 1 pending migration PASS. Needed `unset SUPABASE_DB_URL` because that .env value holds a bare password, not a connection string.

## Next action

1. Done: migration test passed.
2. Not covered: a live end-to-end delete with a real Stripe test subscription on Staging (needs a Staging deploy of the function). Optional before merge.
3. Merge only with Savannah's OK. The migration applies to Production on merge.
4. Delete this file in the last commit before merge.

## Approvals

- Given: checkpoint commit and push (2026-11-03); "action the next steps" (2026-11-03) covering check, review, Staging test, draft PR.
- Still needed: migration test run (Production read); merge.
