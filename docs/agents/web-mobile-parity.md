# Web → mobile parity: state and handoff

Where the mobile-catches-up-to-web programme got to, what is left, and the two
environment traps that will otherwise cost you an hour each.

Read this before picking up any `apps/mobile` work.

## The rule

When a feature lands in `apps/web`, either hoist the logic into `@plot/core`
and consume it from both apps, or open a mobile parity issue. Savannah's
standing instruction is **"everything should copy the web app"** — web is the
reference, including nav shape (Guide nested under Home, History under My
Lists) and copy.

## Done

| Area | State |
|---|---|
| Core hoist (spelling, history, mediaFilters, importDedup, timezones, importParsing, dates) | done |
| Mobile launch flags + PostHog analytics | done |
| Shared copy catalog (`packages/core/copy/`) | done |
| My Lists section system, multi-select, Top 10 folded in | done |
| Date-watched editing in the media panel | done |
| Discover hooks in core (`useDiscover`, `useNewReleases`, `usePlatformCharts`, `useGenres`, `useUpcoming`) | done |
| Mobile Discover sub-tabs: Discover · New Releases · Upcoming · Guide | done |
| Official platform Top 10 charts on mobile | done |
| Type + Genre filters on Discover / New Releases / Upcoming | done |
| Notifications screen + header bell | done |

The upcoming feed had **three** independent implementations (web's
`UpcomingContent`, mobile's Upcoming tab, mobile's `HomeReleases`). All three
now run through `pickOutNow` / `groupFuture` in `packages/core/useUpcoming.js`.

## Left

Both are interactive/visual mobile work. Neither should ship without running
the app — see the blocker below.

1. **4d — drag-to-reorder Top 10.** Web uses raw pointer events in
   `MyListsView.jsx`. On RN use `react-native-gesture-handler` Pan +
   `react-native-reanimated` (both already dependencies). Keep the existing
   ↑/↓ buttons. Port web's semantics: edit-mode only,
   `steps = Math.round(dragOffset / rowHeight)`, clamp to `[1, maxRank]`, then
   walk `topLists.moveUp` / `moveDown` one step at a time.
2. **6f — Discover section headers.** Apply web's `DiscoverSectionHeader`
   treatment (uppercase accent kicker over uppercase title) plus the
   expand/collapse-all control, using the Phase 4a primitives.

Also open, from the original plan's out-of-scope list: mobile Settings lacks
avatar upload, username availability checking, invite-friends share and data
export.

## The app has now been run (2026-09-11)

For the first time, on a physical iPhone via an EAS `development` build. Before
that it had never executed at all, and `tsc --noEmit` plus ESLint were the
entire safety net under 25 mobile commits in 30 days.

The first run immediately justified itself, twice:

1. **It could not be built.** react-native had been bumped to 0.87.1 while Expo
   SDK 57 pins 0.86.3, so Expo's `ExpoReactNativeFactoryDelegate` no longer
   compiled. Nine packages were off the SDK's versions. `npm run mobile:deps`
   now guards this.
2. **The EPG was visibly broken.** The guide's ruler ScrollView was growing into
   the column's spare space, pushing the programme grid 355pt below the channel
   sidebar — the two panes ~7 rows out of alignment. Fixed in `GuideView.tsx`.

Neither was visible to a type check. Phases 0, 0a and 1 of
[the smoke checklist](../qa/mobile-device-smoke.md) are done; **Phases 2 to 7
are not**, so most of the app is still unverified at runtime. "It builds and the
Guide is correct" is not "it works".

**There is a working simulator on this machine as of 2026-09-14** — Xcode 26.6
and an iPhone 17 Pro on iOS 26.5, with the app built and driven on it. Earlier
revisions of this file said there was no Xcode at all; that is out of date.
Getting the simulator usable needed two fixes that no error message names, both
written up in [docs/ops/mobile-builds.md](../ops/mobile-builds.md) — read that
before debugging a simulator that lists no devices, or a `pod install` that dies
talking about Unicode.

**Xcode is still not the only path.** PLOT is
enrolled in the Apple Developer Program (Individual, confirmed 2026-09-11), and
EAS builds on hosted macOS workers, so an `eas build --profile development`
puts a signed build on a real iPhone without Xcode existing locally. That is
the fastest route to a first run. See
[docs/ops/mobile-builds.md](../ops/mobile-builds.md) for the profiles and
[docs/qa/mobile-device-smoke.md](../qa/mobile-device-smoke.md) for what to
drive once it runs.

A mobile change is still static-only unless someone actually ran it. Say so
plainly rather than implying a change was seen working — the device loop now
exists, so "I could not check" is a choice rather than a constraint.

## ⚠️ What static checks do not catch

A stale `MOBILE_READY` set left the Upcoming tab **fully implemented and
unreachable** on `main` for several commits. The component, the render branch
and the filter wiring all landed; only the `['discover','new','guide']`
allow-list did not pick up `'releases'`, because a rebase merged that hunk in
favour of the other side. `tsc`, eslint and CI were all green — the tab was
simply never rendered.

Lessons:

- A feature-flag or allow-list set is exactly the kind of one-line gate that
  compiles perfectly while disabling the feature. After a rebase, re-read the
  gate, don't just re-run the build.
- That specific gate is now guarded: `npm run mobile:tabs` fails the build if
  any `DISCOVER_TABS` id is in neither `MOBILE_READY` nor `MOBILE_DEFERRED` in
  `app/(app)/index.tsx`, so "missing" is no longer expressible. The rules and
  the reconstruction of #587 are in
  `apps/web/tests/unit/mobileTabChecks.test.js`. It is a static guard, not a
  substitute for running the app: it cannot tell you a tab renders the *right*
  content, only that it renders at all.
- Where a screen cannot be run, prefer a **differential test** over
  inspection. `packages/core/tests/unit/homeReleasesParity.test.js` runs the
  pre-refactor algorithm beside the new composition and asserts `deepEqual`,
  and a companion case asserts the regression it guards against actually
  reproduces when the shared `seen` set is dropped — so the test cannot pass
  for the wrong reason.

## Environment notes

- **Worktrees + Metro.** Symlinking the root's `node_modules` into a worktree
  satisfies `tsc`/eslint but **not** Metro: it resolves symlinks to their real
  path, which sits outside `watchFolders`, so the bundle 404s on
  `expo-router/entry`. Temporarily appending the real checkout to
  `config.watchFolders` in `apps/mobile/metro.config.js` fixes it — keep that
  edit uncommitted. Probe the bundle at
  `/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true&minify=false`;
  `/index.bundle` 404s for an unrelated reason and looks like a real failure.
- **Simulator input is in device POINTS** (440×956 on the 17 Pro Max) while
  screenshots come back ~2.1× larger. Passing screenshot pixels lands every tap
  in the top-left — on Discover that is the hero card, so it looks exactly like
  a frozen app. The status-bar clock keeps ticking regardless; it is drawn by
  the simulator, not the app, and proves nothing.
- **Staging has no chart data**, by design. Every nightly job targets
  Production. So "Top 10 by Platform" renders empty in local dev on both
  platforms — environmental, not a bug.
- **`pod install` after an Expo/RN bump** fails with "could not find compatible
  versions for pod ExpoFileSystem … differs from the version stored in
  Pods/Local Podspecs". `rm -rf ios/Pods ios/Podfile.lock && pod install`
  clears it; both paths are gitignored and untracked.
- Run `pod install` and `expo prebuild` with `LANG`/`LC_ALL` set to a UTF-8
  locale, or pod install fails while prebuild still exits 0.
