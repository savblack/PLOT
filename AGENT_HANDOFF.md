# Mobile sign-in: run the security check when the screen opens (#1495)

**Plain words:** The phone app's sign-in screen now starts Cloudflare's "are you human" check as soon as it opens, like the website since #1496. The Sign in / Create account button and the magic-link button wait, with a short note, until the check is done. Nothing for Savannah to do until the pull request is ready.

Status: active
Owner: Jacob (CTO)
Issue: https://github.com/savblack/PLOT/issues/1495 (web parity with PR #1496)
Branch: agent/2026-11-10-2026-11-10-mobile-turnstile-render
Worktree: ~/Developer/PLOT-worktrees/2026-11-10-2026-11-10-mobile-turnstile-render
Latest pushed: 504cb778e (checkpoint)
Updated: 2026-11-10

## Done

- `apps/mobile/components/Turnstile.tsx` (native WebView) and `Turnstile.web.tsx`: execution 'render', refresh-expired/refresh-timeout 'auto', retry signal calls reset() only.
- `apps/mobile/app/(auth)/index.tsx`: `shouldResetCaptcha({ runsOnLoad: true })`, first attempt starts from `captchaErroredRef`, submit + magic link gated by `captchaSubmitEnabled` with `AUTH_PAGE.verificationChecking` / `verificationTapBox`. Inbox (code entry) is never gated. Signup-bypass path unchanged.
- `apps/web/tests/unit/turnstileRetry.test.js`: fake Cloudflare now models render mode; 3 of the new tests fail against the old widget.
- Checks passed: mobile typecheck, `pnpm run lint` (0 errors, no new warnings in touched files), `pnpm run test:unit` (573 + 1273 + 24), `copy:check`.

- iOS simulator (iPhone 17 Pro, iOS 26.5, dev client, Metro from this worktree), with temporary uncommitted logs, now removed:
  - `1x00000000000000000000AA` (always passes): button off with "Running a quick security check…" on open, token 2.8 s later, button on 33 ms after.
  - `3x00000000000000000000FF` (forces checkbox): checkbox shown on open with no tap; button off with "Tick the box above to continue."; tapping the grey button did nothing; ticking the box gave a token and the button turned on.
  - Not run: a real sign-in or signup request (test keys are not accepted by Supabase), Android, Expo web build.

## Next

- PR open, referencing #1495. Do not merge without Savannah's OK. Delete this file in the last commit before merge.
