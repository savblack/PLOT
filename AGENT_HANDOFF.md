# Mobile Google and Apple sign-in

Status: active
Owner: Jacob (mobile implementation), Hailey (signup flow)
Branch: agent/2026-11-12-mobile-social-login
Worktree: /Users/savannahblack/Developer/PLOT-worktrees/2026-11-12-mobile-social-login
Updated: 2026-11-12 15:06 AEDT

## Goal
Enable Google and Apple login in the mobile release configuration and verify the flows.

## Completed and evidence
- Existing mobile auth screen already implements Google system-browser OAuth, Apple native token login, button UI, callback handling, and launch flags (`apps/mobile/app/(auth)/index.tsx`, `callback.tsx`, `lib/launchFeatures.ts`). No auth source changes were necessary.
- Production Supabase `/auth/v1/settings` reports both Apple and Google enabled. The EAS production publishable key successfully accessed settings. Read-only authorize requests for `plot://auth/callback` returned HTTP 302 to `appleid.apple.com` and `accounts.google.com`.
- Set production EAS variables `EXPO_PUBLIC_SHOW_APPLE_LOGIN=true` and `EXPO_PUBLIC_SHOW_GOOGLE_LOGIN=true`; an `eas env:pull production` read-back confirmed both. Existing build 5 predates these flags.
- Staging has Apple enabled but Google disabled; staging cannot establish Google sign-in success.
- `pnpm --filter @plot/mobile run typecheck` passed. `pnpm run lint` passed with 171 existing warnings and no errors. `pnpm run check` passed.
- Started `eas build --platform all --profile production --non-interactive --no-wait` without auto-submit. EAS loaded both flags. Android keystore was created in EAS. Android build ead7b161-e097-4128-98e1-d7618a93e6bf and iOS build 0e725475-cb9b-4ab6-a486-3161023f8ffe were queued; final verdict pending.
- Updated `docs/ops/mobile-builds.md` with current configuration and verification gap.

## Next
Collect final EAS iOS and Android build results. Then run Apple and Google login in a new build on a physical iPhone, confirming callback and session. Test Google on Android too. Do not submit or publish a build before the interactive sign-in check.

## Approvals
Savannah explicitly authorized turning on both logins and verification in this chat. No submission or publication has been authorized. No live user records were changed.

## Latest pushed commit
None yet; checkpoint pending after checks and build metadata.
