# Recover the page after a browser DOM error

Plot now attempts one automatic page remount after the specific DOM error in the PostHog report, so an affected visitor can continue without a manual reload. All local checks passed, including eight browser regression tests. Savannah still needs to approve merging and release.

Status: paused
Owner: Codex, Jacob reliability scope
Updated: 2026-10-20, Australia/Sydney
Branch: agent/2026-10-20-new
Worktree: /Users/savannahblack/Developer/PLOT-worktrees/2026-10-20-new
Latest pushed implementation/review commit: c2c159806. Checkpoint: 5ac43a2f2. Final review commit records the same verified code without skipping CI.

## Goal and evidence

Report: https://us.posthog.com/project/471234/inbox/01a15555-1719-72b7-bc73-b515113ba756
PostHog claim: 01a15870-c5d5-7608-b66d-f0a2381ac648
Current read-only query confirmed 1 matching exception and 1 person over 30 days, at 2026-10-20 05:02:27.985 +11:00. Translation is a hypothesis, not a proven cause.
Current ErrorBoundary sends all non-chunk errors to CrashScreen. No open PR changes ErrorBoundary or this new test file.

## Completed

Added browser-only DOM NotFoundError handling in ErrorBoundary. It reports the error, commits an empty subtree, then mounts fresh children once per boundary lifetime. Repeated failures and unrelated errors keep CrashScreen. Existing stale-chunk and route reset behavior remains.
Added real-browser component regression tests for insertBefore, removeChild, Safari's generic message, repeated errors, failed recovery, other errors, and route navigation.
No shared core, mobile, schema, real user data, or production settings changed.

## Next action

PR https://github.com/savblack/PLOT/pull/1414 is open and attached to this chat and the PostHog report. PostHog confirms in_review. Required CI was pending at the last check. Next: wait for CI and Savannah's merge approval. Keep the report unresolved until the fix merges. Remove AGENT_HANDOFF.md before merge. Savannah must approve merging.

## Verification

Node 22.23.3. pnpm install --frozen-lockfile passed.
pnpm run check passed, lint and production build, zero errors and 178 pre-existing warnings.
pnpm run test:unit passed, 531 web + 1166 core + 14 agent tests.
pnpm --filter @plot/web exec playwright test tests/smoke/dom-error-recovery.spec.js --workers=1 passed, 8 Chromium tests, including a real insertBefore failure after external node replacement.
Targeted ESLint passed after the final test edit. git diff --check passed. Diff reviewed for unrelated work and secrets.
Safari wording is tested in Chromium; actual Safari translation and production recovery have not been tested. A remount can reset unsaved component state. Existing persisted data is reloaded normally.

## Approvals

Authorized: investigate linked production report, implement and verify local fix, checkpoint/push and prepare PR.
Still needed: merge and production release. Do not merge automatically.
