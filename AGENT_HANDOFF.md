# mobile-account-menu

The profile menu in the iPhone app's side drawer now has the same contents as the one on web: the Light / Dark / System switch, the theme circles, View your profile, Settings, Help build Plot, and Sign out. It compiles and passes the code checks, but nobody has looked at it on a phone or simulator yet. That look is the next step before a pull request.

Status: paused
Branch: agent/2026-11-17-mobile-account-menu
Worktree: ~/Developer/PLOT-worktrees/2026-11-17-mobile-account-menu
Updated: 2026-11-17

## Goal

Savannah asked (with a screenshot of web's sidebar account menu) for the profile pop-up to be the same on mobile as on web. Read as the iPhone app's drawer, not web at phone width.

## Done

- `apps/mobile/components/DrawerMenu.tsx`: the account menu follows web's `AccountMenu.jsx`. Mode (Light / Dark / System), a `ThemeChip` per family with the Premium spark on locked ones, View your profile, Settings, Help build Plot (Give feedback, Support Plot), Sign out in the accent. A locked family opens `UpgradeSheet reason="themes"`; its compare link goes to Settings' Premium section.
- `apps/mobile/lib/signOut.ts`: `signOutOfPlot`, the sign-out step moved out of Settings so the drawer and Settings share it (confirm, remove push token, `USER_SIGNED_OUT`, sign out, reset analytics).
- `apps/mobile/app/(app)/settings.tsx`: calls `signOutOfPlot`; two now-unused imports removed.

## Decisions

- The note beside Mode says "This device" where web says "This browser". Phone-only wording, kept in the app file with a comment.
- Menu rows are 40pt tall (web 36px) for touch, and carry no selected highlight, as on web.
- The profile row under the menu is unchanged (name, @handle, chevron). Web's shows "View your profile" under the name.
- No new analytics event: Settings' existing mode and theme controls fire none, and sign out reuses `USER_SIGNED_OUT`.

## Checks

- Passed: `pnpm --filter @plot/mobile run typecheck`, ESLint on the three files (0 errors, 32 warnings, same count as before), `pnpm run copy:check`, `pnpm run core:check`, `pnpm run check`.
- Not run: the menu on a simulator or phone. The iPhone 17 Pro simulator was in use by the `2026-11-17-sim-walkthrough` worktree (Metro on 8090), and the "Plot Shots 6.9" simulator is signed out with no test login to hand.

## Next

1. Run it in a simulator signed in to a Staging test account (Metro from this worktree: `npx expo start --dev-client --port 8083`). Check: the menu fits above the profile row on a small screen, Mode switches, a locked theme opens the upgrade sheet, Sign out asks then signs out and the drawer closes, light and dark.
2. Update the drawer row in `docs/agents/web-mobile-parity.md` with what was run.
3. Open the PR (title and body through `/unslop`, `/before-and-after`), then delete this file in the last commit.

## Approvals

- Given: none beyond the request itself.
- Needed: Savannah's OK to merge.

## Note for the walkthrough session

While trying to run this, taps and two dev-client links were sent to the iPhone 17 Pro simulator by mistake. It was pointed back at `localhost:8090`, but it now shows the sign-in screen. Whether that came from these taps or from the walkthrough itself is not known.
