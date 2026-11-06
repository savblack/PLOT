# Checkout handoff tracking

Checkout tracking now records the browser attempt to open Stripe and caught request/navigation failures. This helps connect an expired checkout to browser activity. Review and merge approval are still needed.

Status: paused
Owner: Kaia area, Codex implementation
Branch: agent/2026-11-06-checkout-handoff-tracking
Worktree: /Users/savannahblack/Developer/PLOT-worktrees/2026-11-06-new
Updated: 2026-11-06

Completed: shared helper, web wiring with immediate beacon delivery, event catalog, documentation and regression tests. Events omit checkout URLs, fragments and raw error text. Mobile follow-up: https://github.com/savblack/PLOT/issues/1459.

Approval: Savannah authorized implementation and proceeding despite open-PR overlap. Merge and deployment approval remain pending.
Checks: frozen dependency installation, focused tests, pnpm run check and pnpm run test:unit passed under Node 22. Independent review found no blockers. Existing initial auth-session lookup happens before the helper and retains its existing error behavior without the new event.
Latest pushed commit: pending checkpoint.
Next: review the PR, then obtain merge approval. Remove this handoff before merge.
