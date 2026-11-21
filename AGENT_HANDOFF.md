# site-critique-fixes

Status: in review (pull request open; do not merge until Savannah asks)
Owner: Claude Code session, for Savannah
Branch: agent/2026-11-21-site-critique-fixes
Worktree: ~/Developer/PLOT-worktrees/2026-11-21-site-critique-fixes
Latest pushed commit: see the branch on GitHub
Updated: 2026-11-21

## In plain words

Fixes from the 2026-11-21 design critique of theplot.tv, all five she approved:
What's On "Coming soon" dates now match their headlines (and released films drop
off), Privacy and Terms are readable in dark mode, the menu bar no longer lets
headings show through, the pricing buttons are sized to their words, and the
homepage names the same import sources as About. Also: the skip links on
Support and Taste match are gone, and the homepage cards no longer bounce.

## Decisions already given (2026-11-21)

- Fix all 5 priority issues.
- Import list: use About's (Letterboxd, Trakt, Netflix, TMDB). The app also
  imports TV Time, IMDb, Simkl and Plex; she may want one combined list.
- Remove the Support skip link (same rule removes Taste match's).

## Checks

- `pnpm run check`: pass. `pnpm run edge:check`: pass (42 functions).
- `pnpm run test:website` 92 pass; `pnpm run test:marketing` 270 pass.
- Browser (local wrangler, port 5212): pricing buttons compact at 1280 and
  375; privacy/terms dark and light; homepage import list; nav 0.97 when
  scrolled; no skip link on Support; no console errors.
- Not seen locally: What's On and title pages (rendered by Supabase edge
  functions). Check What's On's Coming soon after the merge deploys.

## Next

Savannah reviews the pull request. PR #1740 and the nav-polish PR touch the same
files (nav.css, title-page.css, version stamps): whichever merges second needs a
rebase, then `pnpm run footer` and `pnpm run title-renderer` (and bump the
title-page.css stamp in supabase/functions/title-page/index.ts).
Delete this file in the last commit before merge.
