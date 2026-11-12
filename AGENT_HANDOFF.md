# Mobile Google and Apple sign-in

Status: active (Apple and Google sign-in verified on iPhone; icon change awaiting build 8)
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
Sign-in is verified on iPhone (Apple on build 6, Google on build 7). Remaining: Savannah confirms the wordmark icon on build 8, then a pull request to `main` with full checks (remove this file in its last commit). No App Store release without her approval.

## Blockers and approvals
No physical device is connected to this workspace, and the completed iOS production archive is store-distribution only, so interactive sign-in could not be completed. Savannah explicitly authorized enabling both logins and verification in this chat. On 2026-11-12 Savannah approved submitting iOS build 6 to TestFlight for internal testing only ("Yes, TestFlight"). App Store release and Android store submission are still not authorized. No live user records were changed.

## TestFlight upload attempt (2026-11-12)
- `eas submit --non-interactive` stopped: no App Store Connect API key is stored on EAS, and EAS cannot create one non-interactively.
- The interactive `eas submit --platform ios --profile production --id 0e725475-cb9b-4ab6-a486-3161023f8ffe` was started in Savannah's terminal and is waiting for her to answer the key prompt and sign in to Apple. Once the key exists, later submits run unattended.
- Savannah completed the prompt. EAS created App Store Connect API key `Z28R7F3636` (stored on EAS servers, ADMIN role) and uploaded build 6: https://expo.dev/accounts/savblack/projects/plot/submissions/2e767b45-7da0-496b-95a7-49ef405d681a ("successfully uploaded to App Store Connect", ~17:50 AEDT).
- The Apple ID used is `sav.black@outlook.com.au`; Apple's processing email goes there. `app.json` already sets `ITSAppUsesNonExemptEncryption: false`, so no export-compliance hold is expected.
- Apple processed build 6. With Savannah's approval, created internal TestFlight group "Plot team" (automatic distribution on, Apple's default; it cannot be changed later) and added her as the only tester. App Store Connect lists her team login as `black.sav@icloud.com` (Account Holder), so the TestFlight invite went there, not to the .com.au Apple ID used for EAS. Group shows build 1.4.0 (6) "Ready to Test", tester status "Invited".
- 2026-11-12: Savannah installed build 6 from TestFlight on her iPhone and reported Sign in with Apple worked (her report in chat; not independently checked).
- Google sign-in on her iPhone FAILED: Google succeeded, but the auth sheet landed on the theplot.tv homepage instead of returning to the app (her screenshot).
- Diagnosis (code reading, not yet proven on device): `apps/mobile/app/(auth)/index.tsx:175` builds the return address with `Linking.createURL('/auth/callback')`. In a store build there is no hostUri, so expo-linking (`node_modules/expo-linking/build/createURL.js`) produces `plot:///auth/callback` (three slashes). Production Supabase's Redirect URLs list (read in the dashboard, unchanged) has `plot://auth/callback` (two slashes) but not the three-slash form, so Supabase falls back to the Site URL `https://app.theplot.tv`. Apple is unaffected because it signs in with a native token and never uses a redirect. The same constant is the `emailRedirectTo` for mobile magic links and signup confirmation, so those likely land on the web too.
- Savannah chose to fix the app rather than allow-list the three-slash form. `AUTH_APP_CALLBACK` is now the literal `'plot://auth/callback'` (already on production's list), and the unused `expo-linking` import is removed. No production Supabase setting was changed. The deep-link handlers (`callback.tsx`, `lib/magicLink.ts`) already expect `plot://auth/callback`.
- Checks on the fix: `pnpm --filter @plot/mobile run typecheck` and `pnpm run check` passed (exit 0), `git diff --check` passed; local Node 25.7.0, CI uses Node 22. Pushed as 8c068dcfd.
- iOS build 7 started on EAS: https://expo.dev/accounts/savblack/projects/plot/builds/64c7415a-f3d9-4ef0-881d-1de7cf54b4b5. Savannah approved sending it to TestFlight ("Yes, send it"). Build 7 finished 19:27 AEDT and uploaded: https://expo.dev/accounts/savblack/projects/plot/submissions/29efa1b7-1353-4d92-b7a3-1ec635330c7e. App Store Connect showed 1.4.0 (7) "Processing" at last check; the Plot team group has automatic distribution, so it should reach her without further setup.
- 2026-11-12: Savannah installed TestFlight build 7 and reported Google sign-in returned to the app and signed her in ("google worked no problem"; her report, not independently checked). Mobile is iPhone only, so no Android test is planned.

## App icon change (requested 2026-11-12, same branch so it ships in the next build)
- Default launcher icon is now the charcoal wordmark (`assets/icon.png`, Android `android-icon-foreground.png`; `android-icon-monochrome.png` regenerated as a white silhouette of it).
- The old five-dot charcoal mark moved to the Premium picker as alternate `MarkCharcoal` (`assets/alternate-icons/MarkCharcoal*.png`, `app.json`, `lib/appIcons.ts`). The `WordmarkCharcoal` alternate is gone because it is now the default. The mobile app is not released, so no one has that alternate selected.
- Checks: mobile typecheck passed; eslint on the two touched files shows the same 7 pre-existing warnings as the branch base, 0 errors; app.json parses.
- Savannah approved build 8 ("Yes, build 8"). iOS build 8 https://expo.dev/accounts/savblack/projects/plot/builds/c5331dbf-1d69-4769-9dcb-dca2d9ebbe3f finished and was uploaded to App Store Connect (submission d480bdd0-1a97-4db9-85bd-a5d8f9fbc2f9). Icon on device not yet confirmed.

## Latest pushed commit
fad05b75e (pushed; branch matches origin). Checks above still stand; no code changed since.
