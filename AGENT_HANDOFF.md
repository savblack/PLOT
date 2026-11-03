# Handoff: mobile signup-bypass fallback (issue #1437)

**Status:** paused. Code done and checked locally; Staging device checks not run.
**Last updated:** 2026-11-03
**Owner:** Hailey (web and mobile parity). Jacob reviews the edge function change.

## In plain words

When the security check (captcha) on the mobile app times out, sign-up, "resend email", and "email me a link" used to stop with "The security check did not finish". They now fall back to the same backup email path the web app already uses, so the person still gets an account or a sign-in link. The backup email's link now opens the app instead of the website. Nothing is live yet: a person still needs to try it on a phone against Staging, and the edge function has to be deployed to Staging for that.

## Record

- Branch: `agent/2026-11-03-mobile-signup-bypass`, built on top of PR #1435 (`cursor/signup-auth-feedback-fixes-cfdc` at `d6d54282e`). It must land after #1435, or be retargeted onto it.
- Worktree: `~/Developer/PLOT-worktrees/2026-11-03-mobile-signup-bypass`
- Latest pushed commit: see `git log -1` on the branch (checkpoint, `[skip ci]`).

### What changed

- `packages/core/signupBypassClient.js` (new): form token fetch and freshness, minimum form age, signup and link POSTs, error reasons and copy. Platform injects the Supabase client and `client: 'app'`. Never calls GoTrue, so it cannot send an empty captcha token.
- `packages/core/signupFormToken.js`: moved from `apps/web/src/utils/` (web file is now a re-export shim).
- `packages/core/authCallbackReport.js`: `authReportStorageKeys()` so mobile's async storage can feed the sync helpers.
- `packages/core/copy/authPage.js`: `inbox.linkOnlyAfter` (bypass emails have no six-digit code).
- `apps/web/src/pages/AuthPage.jsx`: uses the core client. Analytics slugs and behavior unchanged.
- `apps/mobile/app/(auth)/index.tsx`: signup, resend, and magic link fall back to signup-bypass on captcha timeout (and, for resend and magic link, on GoTrue captcha / SMTP errors, as web does). Fires `signup_captcha_blocked` on widget error (`{ attempt }`) and on timeout (`{ attempt: 0, reason: 'timeout' }`), plus `signup_bypass_offered`. The inbox step hides the code field after a bypass email. Login and password reset still stop with `verificationUnavailable` (no bypass exists for them).
- `apps/mobile/lib/bypassSignupReport.ts` (new) and `apps/mobile/app/(auth)/callback.tsx`: fire `user_signed_up` `{ method: 'email', via_bypass: true }` when the bypass link opens the app, using core's `planAuthCallbackReport`.
- `supabase/functions/signup-bypass/index.ts`, `_shared/signupBypass.ts`, `_shared/signupMagicLink.ts`: optional `client: 'app'` body field makes the link redirect to bare `plot://auth/callback`. Web requests are unchanged.

### Checks passed (local, this worktree)

- `pnpm run test:unit`: 542 + 1218 + 14 pass, 0 fail (includes 14 new `signupBypassClient` tests, 1 new `authCallbackReport` test).
- `deno test` on `signupBypass.test.ts` and `signupMagicLink.test.ts`: 27 pass (3 new).
- `pnpm run edge:check`: 39 functions clean.
- `pnpm --filter @plot/mobile run typecheck`: clean.
- `pnpm run check`: exit 0. No new warnings (the auth screen has the same 8 as before).
- `copy:check`, `core:check`: ok.
- Playwright `turnstile-retry`: 2 pass.

### Still needed (person, Staging project `uzrhfivnhdcfieuaxzip` only, designated test accounts)

1. Deploy `signup-bypass` to Staging from this branch.
2. Confirm `plot://auth/callback` is in Staging's Auth Redirect URLs. If it is not, GoTrue silently sends the link to the Site URL (web).
3. On a device or simulator build pointed at Staging: captcha failure and timeout on signup; resend after signup; magic link for an existing account; new account where mail fails; a late captcha token; the normal token-backed signup still works.
4. In PostHog: `signup_captcha_blocked`, `signup_bypass_offered`, and `user_signed_up` with `via_bypass: true` after opening the link in the app.

### Approvals

- Given: none beyond the ticket.
- Needed: opening a PR; Staging deploy; merge (after #1435).

### Follow-ups

- Bypass emails could include the six-digit code (`generateLink` returns `email_otp`) so a link opened on another device still works for the app.
