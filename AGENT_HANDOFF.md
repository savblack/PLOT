# Handoff: line up the top of every page

Status: paused (checkpoint, not yet a PR)
Owner: Claude Code (desktop session)
Last updated: 2026-11-18

## In plain words
On a computer screen, every app page now starts its first row 44px from the top,
the same spot as History and My Lists. Phone layouts are unchanged.

## Done
- `apps/web/src/styles/app.css`: desktop `.app-main-inner` top padding 1.25rem -> 2.75rem;
  empty History/My Lists toolbars hidden at desktop; `.hist-toolbar` top padding 0;
  Browse, Themes, Import, profile intro/section heads drop their own top padding at desktop.
- `apps/web/src/components/ImportView.jsx` + `ImportSourcePicker.css`: wrapper gets
  `.import-page` so its top padding can be overridden (phone keeps 1rem).
- `apps/web/src/components/NotificationsView.css`: toolbar button top-aligned.
- Measured in the browser at 1440x900 (Staging): first row at 44px on History, My Lists,
  Home, New Releases, Tonight, Calendar, Browse, Settings, Themes, Notifications,
  Your People, Import, Watch Together, Compare, public profile.

## Checks
- `pnpm run check`: passed.

## Second change (Savannah said "Yes, move them")
Calendar's My dates/All releases switch, the Settings search and Your People's
By date/By person switch moved from a row above the page into the top of the left
column (`.cal-side-control`, app.css). Measured: side and main columns both start at
44px on all three. Phones: Calendar's switch and Settings search were already hidden
there; Your People's switch now fills the width above the follow list.
Checks: `pnpm run check` passed, `pnpm run test:unit` passed (0 failures).

## Next
Open a PR when Savannah asks; check the Cloudflare preview (shared shell class changed).
