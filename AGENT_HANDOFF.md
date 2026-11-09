# mobile-search-letterspacing

Plain version: after someone signs in on iPhone by typing the emailed code, the
search box on the first onboarding screen showed its hint text spread out
("S e a r c h  f o r ..."). One style line fixes it. Savannah only needs to
review the draft pull request; nothing is merged or deployed.

Status: paused (draft PR open, waiting for review)
Owner: Jacob (CTO, mobile)
Branch: agent/2026-11-09-mobile-search-letterspacing
Worktree: ~/Developer/PLOT-worktrees/2026-11-09-mobile-search-letterspacing
Updated: 2026-11-09

## Done

- Cause confirmed. React Native's new architecture reuses native text fields on
  iOS. `prepareForRecycle` in `RCTTextInputComponentView.mm` clears the text
  but not the text attributes, and UIKit keeps a kern the new attribute
  dictionary leaves out. The auth screen's code input (`codeInput`,
  letterSpacing 6) is unmounted on sign-in, and the onboarding search field
  reuses that native view.
- Fix: `letterSpacing: 0` on `searchInput` in `apps/mobile/app/onboarding/seed.tsx`.
- Reproduced and verified in a dedicated iOS 26.5 simulator against Staging,
  with two Staging-only test users created through the admin API:
  `letterspacing-a-20261109@plot-staging.test` (before) and
  `letterspacing-b-20261109@plot-staging.test` (after).
  Sign-in used a real 8-digit code from `generate_link`. Staging's `/otp`
  rejects `.test` addresses, so reaching the code step used a temporary,
  uncommitted `__DEV__` shortcut in the auth screen that skipped the send.
- Checks: `pnpm --filter @plot/mobile run typecheck` passed;
  `pnpm run lint` 0 errors.

## Next

- Review the draft PR. Remove this file in the last commit before merge.
- Follow-up, not done: a returning user who signs in with a code and skips
  onboarding may see the same spacing in the next text field they open.

## Approvals

- None needed for the draft. Merge waits for Savannah.
