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
| Discover hooks in core (`useDiscover`, `useNewReleases`, `usePlatformCharts`, `useForYou`, `useGenres`, `useUpcoming`) | done |
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

## ⚠️ Blocker: the simulator cannot build

```
Xcode 26.6          → SDK iOS 26.5
installed runtime   → iOS 27.0 only
```

`expo run:ios` fails with `xcodebuild` exit 70, "Unable to find a destination
matching the provided destination specifier". Falling back to
`-destination 'generic/platform=iOS Simulator'` does **not** work around it —
same error, no `.app`. There is no eligible simulator destination at all while
SDK and runtime disagree.

**Fix (needs a human):** Xcode ▸ Settings ▸ Components → install the iOS 26.5
simulator runtime, or move to an Xcode whose SDK matches the 27.0 runtime.

Until then every mobile change is static-only. Say so plainly rather than
implying a change was seen working.

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
- **Staging has no chart or recommendation data**, by design. Every nightly job
  targets Production. So "Top 10 by Platform" and the For You rail render empty
  in local dev on both platforms — environmental, not a bug.
- **`pod install` after an Expo/RN bump** fails with "could not find compatible
  versions for pod ExpoFileSystem … differs from the version stored in
  Pods/Local Podspecs". `rm -rf ios/Pods ios/Podfile.lock && pod install`
  clears it; both paths are gitignored and untracked.
- Run `pod install` and `expo prebuild` with `LANG`/`LC_ALL` set to a UTF-8
  locale, or pod install fails while prebuild still exits 0.
