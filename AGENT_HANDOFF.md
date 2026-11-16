# mobile-onboarding-match-web

Status: paused
Branch: agent/2026-11-16-mobile-onboarding-match-web
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-mobile-onboarding-match-web
Updated: 2026-11-16

## In plain words

The iPhone setup flow now behaves like the web one. Skip sits top right on
both setup screens and no longer disappears once a title is picked. The
progress bar has three parts. The first screen shows the same 48 trending
titles, three across, with the same bookmark and the same three app logos.
Savannah asked for this on 2026-11-16 ("the web app is correct", then "Yes,
match web"). Nothing has been opened on a phone yet, and no pull request is
open.

## Goal and owner

Bring `apps/mobile/app/onboarding/*` in line with web's
`apps/web/src/pages/OnboardingFlow.jsx`. Parity is Hailey's area. Web is
unchanged.

## Done

- `components/OnboardingScaffold.tsx`: Skip top right on every step (was a
  footer link, hidden once a title was picked or an import was queued).
  Three-segment bar from `ONBOARDING_PROGRESS_TOTAL`, no "STEP 1 OF 2" text
  (read out to a screen reader instead). "I'll do this later" is a separate
  footer link (`onLater`).
- `app/onboarding/seed.tsx`: 48 titles, 3 columns, white bookmark on each
  poster, Letterboxd / Netflix / Trakt marks plus a chevron, no "Trending
  this week" label, Skip from the import sources goes Home, and the
  "Switching apps?" row reopens the sources after an import is queued.
- `app/onboarding/building.tsx`: wordmark and full progress bar at the top.
- `packages/core/copy/onboardingFlow.js`: `seed.noResults` (was typed into
  the screen).
- `docs/agents/web-mobile-parity.md`: deliberate-differences note updated.

## Checks

Passed: `pnpm --filter @plot/mobile run typecheck`, mobile ESLint on the
touched files (4 warnings, the same 4 as `main`), `pnpm run copy:check`,
`pnpm run core:check`, `pnpm run test:unit` (91), `pnpm run check`.

Not done: not run on a simulator or a phone. It needs a fresh account to
reach `/onboarding/seed`.

## Next

1. Drive it on the iPhone simulator with a new sign-up: Skip on both screens
   (with and without picks), the import sources and "I'll do this later",
   the three-across grid height, the building header.
2. Open the pull request once that looks right. Delete this file in the last
   commit before merge.

## Simulator run, 2026-11-16 (stopped at sign-up)

The branch loads on the iPhone 17 Pro simulator against Staging: the dev
build already installed there, Metro from this worktree on port 8082
(8081 belongs to another project; leave it), opened with
`plot://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082`.
The sign-up screen shows Cloudflare's "Verify you are human" box, which an
agent must not tick. Savannah needs to create the test account in the
simulator herself; the agent then drives setup from step 1. Also seen: that
box is drawn on top of the Password field on the Create your account sheet.

## Open decision (Savannah)

Skip on the first screen saves none of the titles already picked, on web and
now on iPhone. Offered: make Skip keep them on both apps. Not approved, not
done.

## Approvals

Given: change the iPhone flow to match web. Still needed: merge.
