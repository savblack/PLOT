# security-low-fixes

Status: active
Branch: agent/2026-11-18-security-low-fixes
Worktree: ~/Developer/PLOT-worktrees/2026-11-18-security-low-fixes
Owner: Jacob (security), via a Claude Code session
Updated: 2026-11-18

## In plain words

This branch fixes five small security gaps from the 2026-11-18 code audit:
- Feedback screenshots can no longer be SVG files, which can hide code.
- One TV network name is now escaped on public title pages.
- Strangers can no longer list everyone's avatar folders. Folder names are user IDs.
- On production, emailed sign-in links only open on theplot.tv.
- The calendar feed escapes a stray line-break character.

Nothing is merged or deployed. The database change goes to production the moment it merges, so it waits for Savannah's yes.

## Changes

- `supabase/migrations/20261118100000_storage_bucket_hardening.sql`:
  - the feedback bucket is limited to jpeg/png/webp/gif;
  - the anon "Avatars are publicly readable" SELECT is replaced by an owner-only folder SELECT. The Settings and mobile `.list(user.id)` calls and `upsert` still work. Public image URLs need no policy.
- `packages/core/feedbackAttachments.js`: adds `FEEDBACK_ATTACHMENT_MIME_TYPES` and `isAllowedFeedbackAttachment`. `SettingsView.jsx` filters to them and sets `accept` from them.
- `supabase/functions/title-page/index.ts`: the meta line goes through `esc()`. `apps/website/functions/_lib/titleRenderer.generated.js` is regenerated.
- `supabase/functions/_shared/signupBypass.ts`: adds `linkOrigin()`. `signup-bypass/index.ts` uses it for the emailed link origin only; CORS is unchanged. Production is detected from `SUPABASE_URL`. Staging keeps localhost and previews.
- `supabase/functions/calendar-feed/index.ts`: `esc()` also turns `\r` into `\n`.
- Tests: `signupBypass.test.ts` (linkOrigin) and `apps/web/tests/unit/feedback.test.js`. The feedback test checks that the allowed types match the migration.

## Checks

Passed locally:
- `deno test` (signupBypass, signupMagicLink)
- `pnpm run edge:check`
- `migrations:check`
- `migrations:contract`
- `db:block-clause`
- `copy:check`
- `core:check`
- `pnpm run check`
- `test:unit`
- website function tests

Run with Savannah's OK (2026-11-18). `.env` was loaded with `set -a; . ./.env`, and Homebrew `postgresql@17/bin` was put on PATH:
- `db:migration-test`: PASS. The new migration applied cleanly to a local copy of production, and the sandbox was torn down.
- `db:drift`: no drift. The only difference is the expected new migration, on both projects.
- `staging:test -- all`: all 31 tests passed. The runner applied the new migration inside each rolled-back transaction.

No Staging test yet asserts the new avatar SELECT rule directly: owner can list their own folder, another user and anon cannot. That would be worth adding.

## Open question for Savannah

The audit also noted that the Premium badge guard runs only on profile updates, not on profile creation. The apps do create a profile row when one is missing (`packages/core` profile writes), so the fix would be to run the existing guard on insert too, not to remove insert. It waits for her decision.

## Next

1. Database tests: done, all passing.
2. Second-agent review: done. No blockers. Its should-fix (a silently dropped screenshot) is fixed in 1e9ed641c.
3. PR open: https://github.com/savblack/PLOT/pull/1762. Auto-fix is watching CI. Remove this file in the last commit before merge.
4. After merge, deploy `signup-bypass`, `title-page` and `calendar-feed`: `supabase functions deploy <name>`.

## Approvals

- Given: Savannah asked to fix these five findings (2026-11-18). She said the Ko-fi badge, the private profile bio and the Stripe price behavior are intended.
- Still needed: running the DB tests, opening the PR, merging, and deploying functions.
