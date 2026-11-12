# web-vitals-page-attribution

Status: active
Branch: agent/2026-11-12-web-vitals-page-attribution
Worktree: ~/Developer/PLOT-worktrees/2026-11-12-web-vitals-page-attribution
Owner: Jacob (CTO) lane; issue savblack/PLOT#1596
Updated: 2026-11-12

## Plain summary

Issue #1596 said /onboarding, /save and /my-lists load slowly. The page speed
readings were filed under the wrong pages: each reading was labelled with the
page the person was on when it was sent, not the page that loaded. Every slow
"/onboarding" reading was really a slow /signup load. This branch files each
reading under the page that loaded. No speed fix yet, because the real slow page
needs a week of correct data first.

## Evidence

PostHog SQL (project PLOT, 14 days to 2026-11-12), joining each LCP reading to
the session's first $pageview path:
- all 10 slow "/onboarding" readings (3.7s to 19.1s) landed on /signup or /login,
  sent 34 to 170 s after landing
- "/my-lists", "/settings", "/import" readings sent 1,349 to 5,846 s after landing
- "/logout" 11.2s reading landed on /signup
- /save readings that landed on /save (10.1s, 4.2s) look genuine

## Done

- apps/web/src/lib/webVitals.js: URL captured at startup; $current_url and
  $pathname both set from it
- apps/web/tests/unit/webVitals.test.js: two tests
- docs/analytics/README.md: note that per-page data before 2026-11-12 is misfiled

## Checks

- node --test webVitals.test.js: 5 pass
- pnpm run check: pass
- pnpm run test:unit: 2,031 pass, 0 fail

## Next

Open PR. After a week of data, re-read per-page LCP; likely real targets are
/signup (poster wall loads ~4 MB of hero images) and /save.

## Approvals

None needed for the code change. Merge waits for Savannah.
