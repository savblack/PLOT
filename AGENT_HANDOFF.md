# 2026-11-21-together-benefit-label

Status: active
Branch: agent/2026-11-21-together-benefit-label
Worktree: ~/Developer/PLOT-worktrees/2026-11-21-together-benefit-label
Owner: Savannah (Claude Code session)
Updated: 2026-11-21

## In plain words

The Premium list on the plans page said "Find something you both want", which wrapped onto two
lines. It now says "Watch together", the feature's own name, so it fits on one line and matches
the menu. The line under it ("The overlap in your watchlists") is unchanged. Web and mobile both
read this from shared copy, so both change. Savannah asked for it; nothing else is needed from her
unless she wants a pull request.

## Done

- `packages/core/copy/plansPage.js`: premiumCard `together` label now reads `WATCH_TOGETHER.hub.title`
  ("Watch together") instead of a second literal. It also shows in upgrade pop-ups' "Also in Premium" rows.
- `packages/core/tests/unit/premiumAlerts.test.js`, `upgradeSheet.test.js`: expected label updated.
- Checks: those tests + membership.test.js pass (21/21); `pnpm run copy:check` passes; `pnpm run check` passes.

## Next

- Open a PR if Savannah asks. Not checked visually on the plans page.
- Delete this file in the last commit before merge.

## Context

Came out of the Decide + Watch together mockup:
https://claude.ai/code/artifact/46bf5f35-a5ba-4a09-99c3-5483daa5c466 (private)
