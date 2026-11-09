# mobile-auth-timeout

Status: active
Branch: agent/2026-11-09-mobile-auth-timeout
Worktree: ~/Developer/PLOT-worktrees/2026-11-09-mobile-auth-timeout
Issue: savblack/PLOT#1477
Owner: Jacob (CTO lane), started from a Claude Code side session
Updated: 2026-11-10

## In plain words

The phone app's sign-in and sign-up buttons could spin forever when the phone
cannot reach Plot's login server. They now give up after 15 seconds, say
"We couldn't reach Plot. Check your connection and try again.", and record why
the attempt failed. Google and Apple sign-in can no longer get stuck either.
Nothing for Savannah to do except review the pull request.

## Done

- `apps/mobile/app/(auth)/index.tsx`: `authRequest()` (15s limit) around
  `signUp` / `signInWithPassword`; `friendlyAuthError` maps timeout/network to
  `AUTH_PAGE.connectionFailed`; Google/Apple use ref latches and time-limit
  their Supabase calls (not the system browser / Apple sheet, which have Cancel).
- `packages/core/authErrors.js`: React Native's "Network request failed" now
  classifies as `network`. Test added.

## Checks

- `pnpm --filter @plot/mobile run typecheck`: pass
- eslint on the screen: 7 warnings, same 7 as main
- `node --test packages/core/tests/unit/*.test.js`, `pnpm run test:unit`: pass
- `pnpm run check`: pass (local)

## Next

PR: https://github.com/savblack/PLOT/pull/1499 (open, not merged).
Latest pushed commit: see branch. Watch CI. Not run on a device or simulator yet.
Delete this file in the last commit before merge.
Approvals needed: merge (Savannah).
