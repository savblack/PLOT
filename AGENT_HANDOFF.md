# app-screenshots

Status: paused
Branch: agent/2026-11-12-app-screenshots
Owner: Jacob (CTO) area; requested by Savannah
Updated: 2026-11-13

## Plain summary

New App Store screenshots (Home, Ted Lasso, My Lists, History) were taken from
app 1.4.0 and uploaded to App Store Connect in the 6.9" and 6.5" slots,
replacing the October set. Not submitted. The listing doc records how and why.

## Done

- Release build of origin/main against Production (env pulled from EAS into the
  session scratchpad, PostHog token blank), iPhone 17 Pro Max simulator.
- Savannah signed in with her own account and authorised making it
  family-friendly. Changes made to it: Ted Lasso, Bluey, Abbott Elementary and
  The Great British Bake Off set to Watching with S1E1 watched; Top 5 Movies #3
  Motor City replaced by Paddington 2.
- Uploaded in App Store Connect Media Manager; confirmed after reload.
- docs/ops/app-store-listing.md updated.

## Noticed, not fixed

- Calendar shows "Nothing coming up" on 1.4.0 with episodes due.
- Top 5 picker "From history": Spirited Away has no poster (blank tile).
- Rings of Power title panel quotes a hostile audience review.
- Demo account password does not match App Store Connect's sign-in box.

## Next

- Optional PR for the doc change. Remove this file before merge.
