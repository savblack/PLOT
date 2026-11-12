# Mobile Google and Apple sign-in

Status: paused
Owner: Jacob (mobile implementation), Hailey (signup flow)
Branch: agent/2026-11-12-mobile-social-login
Worktree: /Users/savannahblack/Developer/PLOT-worktrees/2026-11-12-mobile-social-login
Updated: 2026-11-12 (resumed check; waiting on Savannah's choice of device test route)

## Goal
Enable Google and Apple login in the mobile release configuration and verify the flows.

## Completed and evidence
- The existing mobile auth screen implements Google system-browser OAuth, Apple native token login, callback handling, and both buttons (`apps/mobile/app/(auth)/index.tsx`, `callback.tsx`, `lib/launchFeatures.ts`). No auth source changes were needed.
- Production Supabase Auth settings report both providers enabled. The EAS production publishable key worked. Read-only authorize requests with `plot://auth/callback` returned HTTP 302 to `appleid.apple.com` and `accounts.google.com`.
- Set production EAS variables `EXPO_PUBLIC_SHOW_APPLE_LOGIN=true` and `EXPO_PUBLIC_SHOW_GOOGLE_LOGIN=true`; `eas env:pull production` read-back confirmed both. Staging has Apple enabled but Google disabled, so staging cannot verify Google sign-in.
- iOS production build 6 finished successfully: https://expo.dev/accounts/savblack/projects/plot/builds/0e725475-cb9b-4ab6-a486-3161023f8ffe
- Android production build 2 finished successfully: https://expo.dev/accounts/savblack/projects/plot/builds/ead7b161-e097-4128-98e1-d7618a93e6bf
- Neither build was submitted. EAS loaded both flags for both builds. The builds prove compilation, not a completed provider callback.
- `pnpm --filter @plot/mobile run typecheck`, `pnpm run lint` (171 existing warnings, 0 errors), and `pnpm run check` all passed. These checks ran locally under Node 25.7.0; CI uses Node 22. `git diff --check` passed.
- `docs/ops/mobile-builds.md` records the current state.

## Next
Arrange an installable internal iOS build with the production provider settings, or obtain approval to submit build 6 to TestFlight. Complete Apple and Google sign-in on a physical iPhone, including return to `plot://auth/callback` and an authenticated session. Test Google sign-in on Android too. Do not publish either build before those checks.

## Blockers and approvals
No physical device is connected to this workspace, and the completed iOS production archive is store-distribution only, so interactive sign-in could not be completed. Savannah explicitly authorized enabling both logins and verification in this chat. No submission or publication was authorized. No live user records were changed.

## Latest pushed commit
fad05b75e (pushed; branch matches origin). Checks above still stand; no code changed since.
