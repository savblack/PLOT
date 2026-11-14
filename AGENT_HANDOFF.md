# Mobile: logo in plot's Picks heading

Status: paused (ready for PR)
Updated: 2026-11-14

**Plain summary:** The mobile Home screen now draws the real plot logo in the "plot's Picks" heading, the same as web, instead of typing the word "plot" in the heading font.

- Goal: mobile Home's Picks heading uses the wordmark like web (`DiscoverView.jsx` `<PlotLogo inherit />&rsquo;s Picks`).
- Owner: Jacob (mobile/web app)
- Branch: `agent/2026-11-14-mobile-picks-logo`
- Worktree: `~/Developer/PLOT-worktrees/2026-11-14-mobile-picks-logo`
- Done:
  - `packages/core/copy/discoverView.js`: `picks.afterLogo` ("’s Picks")
  - `apps/mobile/app/(app)/index.tsx`: `PicksHeader` (PlotWordmark + SectionTitle on one baseline; screen readers hear "plot's Picks" as a header)
- Checks passed: mobile `tsc --noEmit`, `copy:check`, `core:check`, eslint on the file.
- Not done: visual check on the simulator (Metro was running from the main checkout); `pnpm run check` before the PR.
- Next action: open a PR after Savannah says yes; delete this file in the last commit before merge.
- Approvals needed: PR open / merge.
