# review-notes

Status: active
Branch: agent/2026-11-11-review-notes
Worktree: ~/Developer/PLOT-worktrees/2026-11-11-review-notes
Owner: Jacob (CTO) area; requested by Savannah
Updated: 2026-11-11

## Plain summary

The note Apple's reviewer reads said Plot shows no prices or purchase links.
The US app does show both, so a reviewer could reject it. The repo now has one
correct copy of that note. App Store Connect was also set up for version 1.0
while the app says 1.2.0, and Apple refuses an upload with a mismatched number.
The fix is to change App Store Connect to 1.2.0. The docs now say so.

## Done (repo)

- docs/launch/app-review-notes.md: single source for the review notes. Merged
  the old demo-account and moderation text with the Premium text, and filled in
  the real demo usernames. The password stays out of the repo.
- docs/ops/app-store-listing.md: removed the stale duplicate, added checklist
  items for the version match and the review notes.
- docs/ops/versioning.md: current version and why the App Store Connect version
  follows app.json.

## Next (App Store Connect, needs Savannah signed in)

1. Open app 6797167864 > iOS version in Prepare for Submission.
2. Change the version string from 1.0 to 1.2.0 (it must equal expo.version in
   apps/mobile/app.json at build time).
3. Under App Review Information > Notes, replace the text with the block in
   docs/launch/app-review-notes.md. Keep the password only in Sign-In
   Information.
4. Save. Do not submit.

## Checks

- pnpm run check: passed (lint + build, exit 0) on a96718c67.

## Approvals

- Savannah asked for both fixes on 2026-11-11. Submission to Apple still needs her OK.
