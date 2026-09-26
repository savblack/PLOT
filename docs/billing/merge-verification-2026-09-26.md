# Billing and import merge verification, 26 September 2026

This integrates the billing and import/tracking branch with main at 31d9d916d.
It is a code release, not public subscription activation. Checkout remains
preview-only in the web client and server checkout requires explicit enablement.
Automatic tracking and the event-backed saved-export surfaces remain gated.
No Android or iOS release is included.

## Verified on the integrated tree

- Frozen pnpm installation passed.
- `npm run check`: lint and production build passed (existing lint warnings).
- `npm run test:unit`: 350 web and 740 core tests passed.
- `npm --prefix apps/mobile run typecheck`: passed.
- `DENO_DIR=/tmp/plot-tax-billing-deno npm run edge:check`: passed, including shared tests.
- `npm run db:migration-test`: eight pending migrations applied successfully to
  a disposable restored production copy, then the copy was destroyed.
- `npm run db:function-diff`: only new functions; no existing function bodies removed.
- Migration, core imports, shared-copy and block-clause static checks passed.
- Staging lifecycle (nine assertions), grace, webhook ordering, checkout locking,
  and Managed Payments checks passed in transactions that rolled back.
- Import browser coverage: 41 tests passed across history-import,
  history-import-sources, list-import and streaming-import.
- Billing browser coverage: all four subscription/entitlement states retain the
  correct portal access and show Ko-fi after the subscription card.

The staging SQL runner now ignores personal psql startup files so the checks
are reproducible. Browser tests required permission to launch Chromium outside
the filesystem sandbox. Real Letterboxd fixture CRLF endings are intentional.

## Rollout boundaries

The approved prices are USD3/month and USD24/year, tax-inclusive, with Adaptive
Pricing and AUD settlement. No live payment, new account connection, or public
checkout activation was performed by these tests. Historical Stripe pilot
results are documented separately; these checks are not a new live-money pilot.

Bangladesh remains accepted per the owner's decision. Registration, filing,
remittance and the deferred tax configuration are still owner follow-ups.
Plex server/account verification and public automatic tracking are separate
rollouts. TV Time remains saved-export-only and gated pending verified samples.

## Review follow-ups before enabling event imports and scheduled tracking

Two gated behaviors need further pilot work: reconcile sparse episode corrections
with an existing sequential watching pointer (including series completion), and
avoid replaying a whole completed provider window solely because it contains an
unresolved duplicate review. The current cursor deliberately stays behind on
partial success to avoid silently losing skipped records. Do not enable these
features publicly on the strength of the billing checks alone.

Free Plex imports now expose server/profile selection independently of the
scheduled-tracking flag. Export pagination uses broadcast preferences' user key,
and mobile supplies the same Netflix episode lookup as web. These changes do
not replace testing with an authorised running Plex server.
