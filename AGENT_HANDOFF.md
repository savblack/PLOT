# site-critique-minor

Status: in review (pull request open; do not merge until Savannah asks)
Owner: Claude Code session, for Savannah
Branch: agent/2026-11-21-site-critique-minor
Worktree: ~/Developer/PLOT-worktrees/2026-11-21-site-critique-minor
Updated: 2026-11-21

## In plain words

The smaller items from the 2026-11-21 theplot.tv critique (she said "fix them"):
one date style on What's On lists, "·" in page titles, FAQ group headings and the
yearly saving on pricing, wording fixes, the homepage Coming up card and title
strip cleaned up, and the two pink headline words set in ink.

## Left alone, with reasons

- Old What's On headlines in Title Case: stored articles in the live database.
  New articles are already checked for sentence case. Editing old ones is a
  production data change and needs her yes.
- Title page "Where to watch in Australia": works as intended (visitor's
  country, US fallback, region menu).

## Checks

`pnpm run check`, `copy:check`, `edge:check`, `test:website` (92) all pass.
Local preview (port 5213): homepage ticker/Coming up/title, pricing FAQ,
billing toggle text, closer colour; no console errors. What's On not
previewable locally.

## Next

Savannah reviews the PR. PR #1740 also edits apps/website/index.html (ticker
links) and the CSP hashes; whichever merges second reruns `pnpm run csp`.
Delete this file in the last commit before merge.
