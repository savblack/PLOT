# awards-analytics

Status: paused (PR open, waiting on Savannah's merge OK)
Owner: Hailey (product analytics for the title panel)
Branch: agent/2026-11-09-awards-analytics
Worktree: ~/Developer/PLOT-worktrees/2026-11-09-awards-analytics
Issue: https://github.com/savblack/PLOT/issues/1273 (closed 2026-11-10; follow-up #1491)
Updated: 2026-11-10

## In plain words

Plot now counts how often a title panel shows the Awards row, on web and
mobile, so you can see what share of title views had awards. It also counts
failed critic-score lookups, which used to fail silently.

## Done

- New event `title_awards_shown` (props `tmdb_id`, `media_type`, `won`, `has_critic_score`), fired once per panel open when awards exist, via `reportAwardsShown` in `packages/core/reviews.js` and the new `onAwardsShown` seam (web `main.jsx`, mobile `configureCore.ts`). `title_viewed` is unchanged.
- Failed critic-score lookups now report `load_failed` with `resource: critic_score` (required by the actionFailures guard for any core module with a success seam).
- `docs/analytics/README.md`: new "Title awards" section; `critic_score` added to the `load_failed` resources.
- `supabase/functions/_shared/importEngine.generated.js` regenerated (`pnpm run import-engine`) because it bundles `config.js`/`actionFailures.js`.

## Checks

- `pnpm run check`, `pnpm run test:unit`, mobile typecheck, `pnpm run edge:check`: all passed.
- Not observable locally: analytics only sends from production hosts. After merge, confirm `title_awards_shown` in PostHog (project Plot) by opening an awarded title on app.theplot.tv.

## Next

1. On Savannah's merge OK: delete this file in the last commit, merge, then check PostHog for the first `title_awards_shown` and `load_failed` / `critic_score` events.

## Approvals

- Given: implement the analytics (2026-11-10).
- Still needed: merge.
