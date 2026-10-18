# Premium checkout tracking

Checkout tracking is being updated so an unfinished session is separate from a payment failure. The old alert expects every checkout to convert and is noisy. Savannah approved updating the tracking and monitoring; merging and deploying code still need approval.

- Owner: Kaia (implementation in Codex).
- Status: ready for review; awaiting merge/deploy approval.
- Updated: 2026-10-18, Australia/Sydney.
- Branch: agent/2026-10-18-checkout-outcomes.
- Worktree: /Users/savannahblack/Developer/PLOT-worktrees/2026-10-18-checkout-outcomes.
- Latest pushed implementation/review commit: f981c814b; this handoff-link update follows it.
- Pull request: https://github.com/savblack/PLOT/pull/1408. CI is running on the checked branch; local validation is complete. No merge/deploy approval yet.
- Verified: authenticated PostHog user sav.black@outlook.com, PLOT project 471234; Stripe connector lists PLOT live account. No live Stripe or Supabase writes made.
- Existing alert: 01a0ddf2-0f01-0000-5f9f-d5fcd290051f; insight wrUVOkuf. Current daily alert fires below 100% conversion. Revenue dashboard 2203520.
- Completed code: return session identity from shared checkout helper; stable PostHog UUIDs and source timestamps on session events; explicit paid/trial checkout completion; expiry remains historical premium_checkout_cancelled with reason=session_expired; asynchronous and invoice failures tracked separately. No entitlement or checkout-gate changes, no schema migration.
- Validation: Node 22.14.0 frozen dependency install passed. pnpm run check passed (178 existing mobile lint warnings, zero errors); pnpm run test:unit passed (527 web, 1161 core, 10 agent tests). pnpm run edge:check passed after final changes: 41 functions, 105 shared tests, edge lint clean. Independent billing review found plan-switch expiry misclassification; fixed with a superseded marker and dedicated event plus metadata-failure and expiry-failure tests. No remaining blocking review finding.
- Live PostHog configuration complete and read back: old 100% alert disabled; new hourly alert 01a14dae-b7a3-0000-aac9-88127d879f03 fires at 3+ distinct affected people/day. Three charts added to Revenue dashboard 2203520 and laid out without overlaps. All require livemode=true and exclude internal/test accounts. New session completion/payment fields require deployment; no fake/backfilled events. See docs/analytics/checkout-outcomes.md for URLs and exact definitions.
- Review complete: independent reviewer reported no blockers after the plan-switch fix and confirmed-open marker cleanup. Final edge checks pass.
- Next: obtain approval to merge and deploy the two billing functions and add the missing Stripe webhook event. Remove AGENT_HANDOFF.md in the last commit before merge, rerun any affected checks, watch CI and deployment guard, then verify sandbox signed events and first live telemetry. Live Stripe endpoint needs checkout.session.async_payment_failed added while preserving existing events. No live Stripe configuration or Supabase writes made. Do not merge/deploy without Savannah's approval.
- Important: docs/analytics/README.md overlaps open PR 1265; keep this task's new definitions in a separate document rather than editing it.
- Limits: prepared checkout URL is not proof the hosted page rendered. Replaced sessions now emit premium_checkout_superseded, outside expiry/abandonment counts. An unreconciled Stripe expiry failure can leave a replacement-intent marker; this logs a warning and is documented. Analytics remains best-effort, not an accounting ledger. New events need deployment; do not claim live delivery yet.
