# signup-button-timeout

Status: paused
Branch: agent/2026-11-06-signup-button-timeout
Worktree: ~/Developer/PLOT-worktrees/2026-11-06-signup-button-timeout
Owner: Jacob (web app reliability), on Savannah's request
Updated: 2026-11-09

## In plain words

The signup page's buttons could freeze. If a visitor's browser couldn't reach
our database service, "Continue with Google" stopped responding for the rest
of the visit, and "Create account" spun for about 90 seconds before showing
"failed to fetch". Now both give up after 15 seconds, unlock, and say "We
couldn't reach Plot. Check your connection and try again." Pressing Back from
Google's page also unlocks the buttons. These failures are now recorded in
PostHog, where before they left no trace.

Savannah needs to: approve opening a pull request, after the open steps below.

## Why

Signups fell from about 11 a week to about 4 starting around Oct 24, 2026.
PostHog showed no email signup getting through since Oct 31. Two session
recordings showed the frozen Google button, one showed the 90-second hang:
- https://us.posthog.com/project/471234/replay/01a18ec5-41c1-74a7-a32b-6e335f56d8d6
- https://us.posthog.com/project/471234/replay/01a1a85c-3aba-7225-83ba-38d0f82633c8
Separately, Google search visits fell 30-45% from mid-October (Alix's area, not this fix).

## Done

- packages/core/authTimeout.js: withAuthTimeout + AUTH_REQUEST_TIMEOUT_MS (15s).
- packages/core/authErrors.js: new slugs `timeout` and `network` (failed to fetch / NetworkError / Load failed).
- packages/core/copy/authPage.js: AUTH_PAGE.connectionFailed.
- apps/web/src/pages/AuthPage.jsx: signUp and signInWithPassword time-limited;
  Google/Apple handoff time-limited, stall timer if the page never leaves,
  bfcache Back restore unlocks; OAuth failures now send signup_submit_failed /
  login_submit_failed with `method`.
- packages/core/tests/unit/authTimeout.test.js.

## Checks

- `pnpm run check`: passed (exit 0) before the copy string was added; after it,
  copy:check, core:check, eslint on the changed files and core unit tests passed.
  Full `check` not rerun after that one-line copy addition.
- `pnpm run test:unit`: passed (554 + 1234 + 16).
- Browser check: NOT done. The local dev server (port 5188) hung serving
  pre-bundled dependencies while other sessions' servers were running.

## Next

1. Rerun `pnpm run check`, then check in the browser at /signup: stub `window.fetch`
   to hang on `/auth/v1/` and confirm the message appears after ~15s and the buttons unlock.
2. Mobile parity: mobile auth (`apps/mobile/app/(auth)/index.tsx`) has the same
   untimed calls. Open a parity issue, or widen this fix to mobile, using @plot/core/authTimeout.js.
3. Open the PR (needs Savannah's OK). Remove this file in the last commit before merge.

## Overlap

`agent/2026-11-09-web-turnstile-wait` (another session, uncommitted) also edits
AuthPage.jsx: imports near line 15 and the captcha wait (~lines 117-240). Expect
a small merge conflict at the import lines only.
