# newsletter-confirm

Status: active
Branch: agent/2026-11-18-newsletter-confirm
Worktree: ~/Developer/PLOT-worktrees/2026-11-18-newsletter-confirm
Owner: Alix (marketing signup) and Jacob (security), via a Claude Code session
Updated: 2026-11-18

## In plain words

Anyone could sign someone else's email up for Plot's weekly digest. Now a signup on theplot.tv sends a "confirm your subscription" email, and the address only gets the digest after its owner presses Confirm on a new page in the web app. App users who switch marketing emails on in Settings are unchanged, because that is their own verified address. Nothing is merged. It waits for review and Savannah's OK.

## Changes

- `supabase/migrations/20261118160000_newsletter_double_opt_in.sql`: adds `pending` to the status check, plus `confirm_token` (unique when set) and `confirm_sent_at`. Expand only.
- `supabase/functions/_shared/newsletterConfirm.ts` (+ test): the decisions and email text.
- `supabase/functions/newsletter-subscribe/index.ts`:
  - subscribe writes a pending row and emails the link (Resend, then Brevo);
  - new `?action=confirm` (GET redirects, POST confirms and syncs Brevo).
- `supabase/functions/_shared/database.types.ts`: the 2 new columns, added by hand because production doesn't have them until merge.
- `packages/core/copy/newsletterConfirm.js`, `apps/web/src/pages/NewsletterConfirmPage.jsx` and its route in `router.jsx`.
- `packages/core/analyticsEvents.js` (`newsletter_confirmed`) and `actionFailures.js` (`newsletter_confirm`). `importEngine.generated.js` is regenerated because it bundles `actionFailures.js`.
- `apps/website/js/whats-on.js`: the success message now says to check your inbox.
- API docs, openapi.json and the agent skill now describe the confirmation step. The skills index is regenerated.
- `docs/analytics/README.md`: a new Newsletter section.
- `scripts/staging-newsletter-pending-test.sql`: a new Staging test.

## Checks

Passed:
- `pnpm run check`
- `test:unit`
- website function tests
- `edge:check`
- Deno tests (8/8)
- `migrations:check`
- `migrations:contract`
- `db:block-clause`
- `copy:check`
- `core:check`
- `skills:check`
- `db:migration-test`
- `db:drift`
- `staging:test -- newsletter-pending` (4/4)

`staging:test -- all`: 31/32. The `block` test fails on main too, because of leftover Staging fixture data.

Browser, on a placeholder backend:
- the Confirm card renders;
- a link with no token shows "not valid";
- a network failure shows the error with retry.

Not verified end to end: no real confirmation email was sent, and the function was not deployed to Staging.

## Next

1. Second-agent review: done. Fixed: the send claim is race-safe (conditional write, one email per claim); the confirm write is conditional on status; the email is sent after the response (no timing or outage difference between new and existing addresses); unsubscribe clears an unclicked confirm token.
   Not changed: a Settings toggle with a pending row (the trigger's on-conflict update already makes it active; no Staging test, because that path fires an outbound profiles webhook outside the rollback); linking a confirmed website row to an app account (an existing gap).
2. Open the PR.
3. Get Savannah's OK to merge, and remove this file in the last commit first.

## Follow-ups

- The app waitlist (`list: 'mobile-app'`) is still single opt-in.
