# design-audit-bugs

Status: paused
Branch: agent/2026-11-09-design-audit-bugs
Worktree: ~/Developer/PLOT-worktrees/2026-11-09-design-audit-bugs
Updated: 2026-11-10

## In plain words

Twelve small problems from the design audit of the web app were looked at. Eleven are
fixed outright and one (the Plans page saying different things in different places) is
fixed only where the code proves what is live; the rest of that one is a question for
Savannah. Nothing is merged and no pull request is open. The next step is a review, then
opening the pull request.

## Goal

Fix the 12 design-audit bugs in `apps/web` and `packages/core`, one small commit each,
without touching the parallel icon / bookmark / Watchlist work (no edits to
`SearchPalette.jsx`, `MediaCard.jsx`, `ListCards.jsx`, `OnboardingScreen.jsx`,
`DiscoverView.jsx`, watchlist wording in `copy/media.js`, Premium gate destinations, panel
back-stack, or the phone nav drawer).

## Done (commit per bug)

1. `857a25ffd` Whole-season alert upgrade sheet. New `seasonAlerts` reason in
   `packages/core/copy/plansPage.js` and `packages/core/upgradeSheet.js` (gate feature
   `season_alerts`), used by `PremiumAlertButtons.jsx`. Mobile reads the reason type from
   core JSDoc and still typechecks. Tests: `premiumAlerts.test.js`, `upgradeSheet.test.js`.
2. `541b8e831` Plans page: "Try taste overlap" only for Premium members (`PlansPage.jsx`).
3. `3c903d93d` Plans copy: FAQ and the Free stats description no longer call deeper stats
   "planned" (taste overlap is live for Premium on web and mobile). Push notifications and
   "Widgets and app icons" were left alone. See Questions.
4. `ca23542ff` Themes gallery link ("Preview") shown to everyone (`SettingsThemeRows.jsx`).
5. `7cdb177e1` Legal pages: new `apps/web/src/components/LegalBackLink.jsx` (back in
   history when reached in-app, else `/home` when signed in, else `/login`), used by
   Terms, Privacy, Community. Settings > Help & about uses router links. Legal text unchanged.
6. `cb78ba5c5` Titles for `/browse`, `/join-list/*`, `/watch-with/*` in
   `packages/core/navigation.js` (copy in `browse.js`, `collaborativeLists.js`, reuses
   `WATCH_TOGETHER.navLabel`). New test `navigationTitles.test.js`.
7. `11f43d792` Escape closes KebabMenu, GroupedFilterMenu, HomeLayoutSheet,
   SidebarOrderSheet and the Settings sheets (Region, Timezone, providers, genres, Clear
   lists, FeedbackPanel) through a new hook `apps/web/src/hooks/useEscapeToClose.js`.
   Topmost only; focus returns to the opener.
8. `eca7bad93` Guide error state uses `.empty-state` and `btn btn-secondary btn-sm`.
9. `199719931` "Plot Premium" in prose strings in `packages/core/copy` (customLists,
   settingsView `youHavePremium` and `needsPremiumMessage`, plansPage eyebrow and FAQ,
   profileBadges). Display-font strings kept lowercase. Tests updated to match.
10. `4e07b1c09` Bulk favorites removal uses `createUndoBatch` (`ListSections.jsx`); one
    extra case in `undo.test.js`. Note `FAVOURITES_ENABLED` is false, so this UI is hidden today.
11. `67b159877` Time zone and region save errors show inside the open sheet
    (`role="alert"` beside Save); the sheet stays open. New copy
    `SETTINGS_VIEW.timezone.failedToSaveTimezone`, new class `.settings-picker-error`.
12. `08a09e945` `docs/design/shared-design-system.md` links `packages/ui/PlotLoader.jsx`.

## Checks

Run on Node v25.7.0 (the only Node on this Mac; CI uses 22):

- `pnpm install --frozen-lockfile`: ok
- `pnpm run check`: exit 0. ESLint 0 errors, 175 warnings, all existing mobile ratchet
  warnings; none in changed files.
- `pnpm run test:unit`: exit 0 (web 564/564, core 1275/1275, scripts 24/24)
- `pnpm --filter @plot/mobile run typecheck`: exit 0
- `copy:check`, `core:check`, `tokens:check`, `emails:check`, `migrations:check`,
  `footer:check`, `changelog:check`: all pass
- Runtime, web Storybook driven with Playwright: Escape closes the filter menu, kebab menu,
  Sidebar order sheet, Region sheet, Timezone sheet (from its search input) and Feedback
  panel, with focus back on the opener; the inline Name editor still cancels with Escape;
  Free Settings shows the Preview link; a failed time zone / region save shows the error in
  the sheet and keeps it open.
- Not run: Chromatic (out of quota), `test:smoke`, `test-storybook:web`.
- Not checked in a browser: HomeLayoutSheet Escape (its only story with a real close
  handler, Home/Jump to card, already crashes on `main` because it passes no `prefs`); the
  legal Back link; the Plans page link; the Guide error state; the season alert sheet.

## Next action

Open the PR after review. Delete this file in the last commit before merge.

## Approvals

Given: none needed so far (no merge, no deploy, no user data touched).
Still needed: Savannah's OK to merge.

## Questions for Savannah

- Plans page, push notifications: the table ticks them for Free and Premium, the FAQ says
  "planned for everyone". The push code exists in the mobile app and on the server, but
  whether the mobile app is in people's hands cannot be told from the code. Left as is.
- Plans page, "Widgets and app icons": the table shows a plain tick, the card says they are
  coming, the FAQ says planned. #1386 removed the "Coming soon" tags from the table on
  purpose and a test guards that, so the tick was left. Widgets have no code; app icons
  exist only in the unreleased mobile app.
- `CUSTOM_LISTS.limitMessage` still says unlimited lists are "planned for Plot Premium",
  though they are live. Only the casing was changed.
- `SETTINGS_VIEW.calendarFeed.needsPremium` ("A live calendar feed needs plot Premium") is
  both a display-font dialog title and a plain row hint, so it was left lowercase.
  Many other prose strings still write lowercase "plot" without "Premium" (sharing text,
  Settings subtitle, newsletter copy). Not swept: outside this ticket.
- The season alert gate now reports `premium_gate_hit` with `feature: season_alerts`
  (it used to be counted as `people_alerts`). Say if a different name is wanted.
- Mobile parity: mobile Settings still shows the themes Preview link to Premium only.
