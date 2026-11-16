# double-back-link

A list's page (Watchlist, Favorites, any custom list) showed two "My Lists" back
links on a computer screen, one pink and one grey. It now shows one, the grey
one every other page uses. Nothing is merged yet: Savannah needs to say yes to a
pull request.

Status: paused
Branch: agent/2026-11-16-double-back-link
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-double-back-link
Owner: Jacob (web app). Done in Claude Code at Savannah's request.
Updated: 2026-11-16T10:44:26Z

## Goal

Savannah, 16 Nov 2026: "this double breadcrumb needs to be fixed absolutely
everywhere i never want to see this in my app".

## Cause

AppShell.jsx drew its own accent "‹ My Lists" breadcrumb at sidebar widths
(1024px and up). ListPage.jsx drew a BackLink meant to hide at those widths via
`.list-page-back--mobile { display: none }`. BackLink.css loads after app.css
and sets `.back-link { display: inline-flex }` at the same specificity, so the
hide lost and both showed.

## Done

- AppShell.jsx: breadcrumb removed, with its two unused imports.
- app.css: `.app-page-breadcrumb` rules removed; `.list-page` gets 1rem top
  padding at 1024px and up; `.list-page-back--mobile` renamed `.list-page-back`
  and no longer hidden at any width.
- ListPage.jsx, CollaborativeLists.css: class rename only.
- apps/web/tests/unit/oneBackControl.test.js: fails if the shell draws a back
  control, if the breadcrumb class returns, or if a bare one-class rule tries
  to hide a BackLink.
- Audit: AppShell was the only shell-level back control. No other page pairs a
  shell back link with its own.

## Checks

- pnpm run check: pass (0 lint errors).
- pnpm run test:unit: pass, 0 failures.
- Browser, real AppShell around a stand-in list page (temporary fixture, since
  deleted): one back link at 1280px and at 375px, no console errors.
- Not checked: the signed-in app with real list data, because that needs
  Savannah's login. Check a list page on the pull request's Cloudflare preview.

## Next

Open the pull request once Savannah approves. Delete this file in the last
commit before merge (`pnpm run worktrees -- done`).

## Approvals

Given: fix it. Still needed: open the pull request, merge.
