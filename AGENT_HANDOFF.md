This existing PR is being reviewed and checked before Savannah decides whether to merge it. No production changes have been made.

Status: active
Owner: Codex
Updated: 2026-10-26T23:55:40.845773+00:00
Goal: Finish and verify existing PR #1430, not start a separate implementation.
PR: https://github.com/savblack/PLOT/pull/1430
Branch: dependabot/npm_and_yarn/app-minor-patch-656b5a887d
Worktree: /Users/savannah/Developer/PLOT-worktrees/2026-10-27-dependencies-review
Latest pushed commit: 6a49cb14846bd38e6aabe6f87bef8bca778a7670
Git common directory: /private/tmp/plot-pr-recovery.git
Original Cursor task completed before takeover. No prior local session lock or handoff was present on this remote branch.
Next: inspect the diff and review threads, run scoped checks and pnpm run check, record blockers and results, push only task-specific fixes.
Approval: branch work and checkpoints authorized; merge, production, and user-data writes are not authorized in this chat.

Reproduced the failing Expo guard. This dependency PR bumps mobile react and react-dom to 19.3.1, but installed Expo SDK 57.0.30 requires 19.2.3. Restored mobile React, React DOM, and React types to the existing main versions, retaining the other requested updates. Regenerating pnpm-lock.yaml with pinned pnpm 10.6.3. Before evidence: .artifacts/dependency-review/mobile-before.txt. No native build has been claimed.

Verification complete for the corrected dependency set: frozen install succeeds; Expo SDK guard passes all 31 managed dependencies; pnpm run check passes with 0 errors and 175 existing warnings; unit suites pass 536 web + 1186 core + 14 scripts; mobile tsc --noEmit passes; web Storybook builds successfully. No production changes or package policy changes. Next: browser smoke check, checkpoint, then remove this handoff before merge.
