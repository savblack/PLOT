# 2026-11-18-top10-row-align

Status: active
Branch: agent/2026-11-18-top10-row-align
Owner: Claude Code (Jacob's area: web app)
Updated: 2026-11-18

## Plain summary

On Home, the "Top 10 by Platform" rows now put Movies / TV right after the
platform name, with the arrows on the far right, and the posters run full width
underneath. Titles now start on the same line as the rows above. The rank
numbers in these rows are Plot pink (the accent) instead of the light pink.
Savannah picked this ("A + Plot pink") from the mockup page
https://claude.ai/artifact/ANXAn2jawR72yxgSNtsSiL.

## Done

- `apps/web/src/components/DiscoverView.jsx`: arrows moved into the label row; rail no longer wrapped.
- `apps/web/src/styles/app.css`: removed the desktop 168px label column, arrows `margin-left: auto`,
  list gutter now `var(--discover-rail-gut, var(--gut))` like other Home rails, numbers `var(--accent)`
  scoped to `.discover-plat-rail` (profile Top 5 numerals unchanged).
- `pnpm run check` passed.

## Next

- Look at Home signed in (Staging) at desktop and phone widths, then open the PR.

## Not changed

- Mobile: its platform rows are a fold-out list with white numbers, a different design. No parity issue opened yet.
