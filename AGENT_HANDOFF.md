# history-stat-drilldown

Status: active
Branch: agent/2026-11-03-history-stat-drilldown
Worktree: ~/Developer/PLOT-worktrees/2026-11-03-history-stat-drilldown
Issue: savblack/PLOT#1446
Updated: 2026-11-03

## In plain words

On History, a Premium viewer can now tap the "titles" count, the "your night" weekday, or a new "See your <genre> titles" link, and get the list of exactly those titles with a chip above it that removes the filter. The filter lives in the web address, so the link can be shared. Free viewers see History exactly as before. Nothing to do yet except decide the two questions under Next.

## Done (verified)

- core: `filterEntries` takes `year` and `weekday`; new `packages/core/historyDrilldown.js` (URL params, filter, event props); event `HISTORY_STAT_DRILLDOWN`; copy in `copy/historyView.js`; tests added.
- web: `HistoryView.jsx` tiles are links for Premium, chip, URL-driven; CSS in `app.css`.
- mobile: `HistoryInsights.tsx`, `HistorySection.tsx`, `my-lists.tsx` (route params `stat/year/genre/weekday`).
- Checks: `pnpm run check` pass, mobile typecheck pass, `pnpm run test:unit` pass, copy:check / core:check pass, lint 0 errors.

## Next

1. Decide: free viewers currently see plain tiles. Send them to the upgrade page on tap instead?
2. Network and person drill-downs wait on #1269 (not built).
3. Add `history_stat_drilldown` to the PostHog Tier 1 action if wanted (not done, PostHog not touched).
4. Not tried on a device or in the browser with a real Premium account. Run `pnpm run dev` and check once.
5. Open the PR (title/body through /unslop), delete this file in the last commit.

## Blockers / approvals

None. Nothing merged, no live data touched.
