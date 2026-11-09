# web-turnstile-wait

Status: active
Owner: Jacob (CTO) area, worked by a Claude Code side session
Branch: agent/2026-11-09-web-turnstile-wait (stacked on agent/2026-11-06-mobile-turnstile-login, PR #1474)
Worktree: ~/Developer/PLOT-worktrees/2026-11-09-web-turnstile-wait
Updated: 2026-11-09

## In plain words

Web sign-in and password reset gave up on Cloudflare's security check after
16 seconds, even while its "Verify you are human" box was on screen. Now they
use the same rules as the mobile fix: up to 45 seconds for the invisible check,
and up to 2 minutes once the box is showing. Signup and magic link keep their
short wait before the backup route. The check is still required.

## Done

- `apps/web/src/components/Turnstile.jsx`: `onInteractive` prop from
  `before-interactive-callback`.
- `apps/web/src/pages/AuthPage.jsx`: wait uses `captchaWaitOver`, retry uses
  `captchaRetryAfterWait` (from #1474's `packages/core/captchaGate.js`).
- `apps/web/tests/unit/turnstileRetry.test.js`: submit and fake-clock wait tests.
- Browser test on localhost:5177 with Cloudflare's always-interactive test key
  `3x00000000000000000000FF` (env override only, nothing committed): checkbox
  shown, no error at 22s or 60s, error at 120.4s, no request sent to Supabase
  without a token.

## Next

- `pnpm run check`, open the PR based on #1474's branch. Merge #1474 first.

## Approvals

No Supabase auth settings changed. Merge needs Savannah.
