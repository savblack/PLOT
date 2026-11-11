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

## Done (App Store Connect, 2026-11-11)

- Version string changed from 1.0 to 1.2.0, and the review notes replaced with
  the block in docs/launch/app-review-notes.md (paragraphs unwrapped). Saved,
  not submitted. Confirmed after a page reload: version reads 1.2.0, notes
  contain the new Premium text and not the old "shows no prices" line. Sign-In
  Information fields were left as they were.

## Next

- Open a PR for this branch (docs only), after removing this file.
- Before the next `eas build`: confirm expo.version still equals the App Store
  Connect version, and that the demo account is on the Free plan.

## Checks

- pnpm run check: passed (lint + build, exit 0) on a96718c67.

## Approvals

- Savannah asked for both fixes on 2026-11-11. Submission to Apple still needs her OK.
