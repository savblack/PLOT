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
| My Lists section system, multi-select, Top 5 folded in | done |
| Date-watched editing in the media panel | done |
| Discover hooks in core (`useDiscover`, `useNewReleases`, `usePlatformCharts`, `useGenres`, `useUpcoming`) | done |
| Mobile Discover sub-tabs: Discover · New Releases · Upcoming · Guide | done |
| Official platform Top 10 charts on mobile | done |
| Type + Genre filters on Discover / New Releases / Upcoming | done |
| Notifications screen + header bell | done |
| "Help build Plot" drawer section (feedback + Ko-fi), flat mobile variant | done |
| Premium upgrade sheet at the Free list cap (My Lists, title panel, collections; content from `@plot/core/upgradeSheet.js`). "Compare every feature" opens Settings' Premium section, since mobile has no /plans | done |
| New onboarding (#1167): save a few with the Switching apps? branch, where do you watch, the building moment; name from the sign-in provider (`app/onboarding/*`, state in `contexts/OnboardingFlowContext.tsx`) | **static only**: not run on a device |
| Home greeting, first-run Saved to watch rail, and the Finishing touches card with its friends, import and people sheets (`components/FinishingTouches.tsx`, storage in `lib/finishingTouches.ts`) | **static only**: not run on a device |
| "Your first week of Premium" on Home (`components/PremiumFirstWeek.tsx`, storage in `lib/premiumFirstWeek.ts`): the five steps, wording and seven-day window from `@plot/core/premiumFirstWeek.js`, drawn with the Finishing touches card's styles and shown in its place. Each button opens mobile's own screen (Themes, Your people, Watch together, Settings › Connections for the calendar, My Lists). The phone has no checkout return and the profile has no upgrade date, so the week starts when the phone sees an account it had seen on Free turn Premium, or a Premium account under seven days old (`premiumFirstWeekShouldStart`). Someone who upgraded on web before ever opening this phone, on an account older than a week, gets no card | **run in the iOS simulator against Staging (2026-11-11)** on a test account switched from Free to Premium in the database: the card took Finishing touches' place, survived a restart, expanded to the five steps, "Pick a theme" opened Themes, choosing a theme ticked the step (1 of 5), `settings?section=connections` opened on Subscribe to Calendar, and Dismiss gave the slot back. The header was fixed after this run showed its arrow wrapping to a second line. **Not run**: the start after returning from Stripe, the other three buttons pressed from the card, the all-done state, Android |
| Title panel foot bar (Watched it? / Thoughts?, half stars, Review and Private note boxes, one editor sheet): same state in `@plot/core/useTitleFootBar.js`, drawn in `components/TitleFootBar.tsx` | **static only**: not run on a device |
| Streaming alerts on watchlist films (Free, in the app): the title-panel card (`components/StreamingAlertsCard.tsx`, only when the film is on the watchlist), the Settings > Viewing switch and muted films list (`StreamingAlertsSettings` in `app/(app)/settings.tsx`), and a Manage alerts footer on Notifications. Hooks `useStreamingAlerts.js` and copy `STREAMING_ALERTS` are shared with web; the notification row already rendered | **run in the iOS simulator against Staging (2026-10-05)**: the card on a watchlist film (on, then muted, with the write confirmed in the database), the Settings > Viewing group, the muted films list, and the `?section=viewing` deep link. **Not run**: the switched-off card state, "Turn on" from the muted list, and the Manage alerts footer (needs a `streaming_arrival` notification). The simulator's installed dev client predates `expo-image-picker` (#1193), so it was run with that one module stubbed, uncommitted |
| Customize Home (#1334): shelf order and hidden shelves on Home. Rules and persistence shared in `@plot/core/homeLayout.js` and `useHomeLayout.js` (profiles.home_layout). Mobile draws its feed from the layout (`app/(app)/index.tsx`, the releases slot carries Out Today, recent and coming soon), lists the shelves on `/(app)/home-layout` with up/down and show/hide (no drag), and links it from Settings > Appearance and a Customize link under the feed | **run in the iOS simulator against production (2026-10-15)**: Home renders from the layout, the screen opens from a deep link and lists every shelf, and a move before the migration had merged showed the save error and reverted (the column did not exist yet). **Not run**: a successful save, Reset, and the Settings row (needs the migration on production) |
| Pinned shelves (Premium), density, card style, sidebar order: shared core (`homeLayout.js` pins, `homePins.js`, `usePinnedShelves.js`, `uiPrefs.js`, `useUiPrefs.js`, `useProfileJson.js`) with `profiles.ui_prefs` and `home_layout.pins`. Mobile draws pinned shelves on Home (`PinnedShelves` in `components/people/HomeShelves.tsx`), scales poster cards by density (`lib/homeLook.ts`), and manages both from Customize Home (`app/(app)/home-layout.tsx`, Free viewers get the `pins` upgrade sheet). Card style List is drawn by `components/PosterRail.tsx` and `components/ListRow.tsx` for the poster rails (Up next, Hot Right Now, Continue watching, Your people, pinned shelves); the backdrop cards, platform charts and Releases rails keep their layouts, as on web. Sidebar order is web only because mobile has no sidebar | **run in the iOS simulator against Staging (2026-10-16)**: the Customize Home screen with Look (Density and Cards), Pinned (Free note and the upgrade sheet) and Shelves; choosing List saved and drew Up next and Hot Right Now as rows, and Posters restored them. **Not run**: pins on a Premium account (the Staging test account is Free), Continue watching and Your people as rows (no data on the test account), and density saving on a device |
| My Lists section order: the order saved on web's Customize My Lists (`profiles.ui_prefs.myLists.order`, rules in `@plot/core/uiPrefs.js`) places mobile's sections too (`arrangeByMyListsOrder`; Watchlist, Favorites and custom lists are web's one Lists section and move together). `/(app)/my-lists-layout` lists the sections with up/down and Reset, linked from a Customize link under the All view. Folds are shared too: Watching, Top 5, Lists, Smart lists and Shared read and write `ui_prefs.myLists.collapsed` (`FOLD_SYNCED` in `my-lists.tsx`), so folding one on web folds it on the phone; Watchlist and Favorites have no fold of their own on web and stay per device (`lib/sectionOpenState.ts`). Shared lists have their own section, split into Shared by me and Shared with me (`splitListsBySharing`), drawn once the viewer has a shared list; there is no New shared list tile because mobile starts one from a list's Invite people | **run in the iOS simulator against Staging (2026-11-11)**: My Lists drew in the default order, Customize listed the four sections, two moves and Reset each saved (read back from `profiles.ui_prefs` on Staging) and My Lists followed, and folding Top 5 and Smart lists wrote `collapsed`. **Not run**: the Shared section (the test account has no shared list), a fold made on web showing on the phone, the collapse-all control, Android |
| Tab bar and header: the tab bar is icons only, with a More button last that opens the drawer, as on web's phone tab bar (`app/(app)/_layout.tsx`; the button is the `menu` route's tab, which never navigates). The header's left slot is search, where the menu button was (`components/ScreenHeaderBar.tsx`), and Home has no search bar of its own. The Just Decide button is the brand-fill disc with a charcoal sparkle and no halo (`components/TonightFab.tsx`). The title panel closes on a downward drag: the handle always, the content while scrolled to its top (`components/MediaPanel.tsx`, rules in `@plot/core/sheetDrag.js`) | **run in the iOS simulator against Staging (2026-11-12)**: five centered icons with no labels; More opened and closed the drawer; search in the header on Home and My Lists; the restyled button in the light theme; on the title panel a downward swipe closed it, a short slow drag sprang back, the content still scrolled, and the handle closed it while scrolled. **Not run**: how the drag feels under a real finger (the simulator's taps lag), the dark theme, VoiceOver, Android |
| My Lists and History closer to web's phone layout: on the All view every list is a fanned cover (`components/ListCover.tsx`; Watchlist, Favorites, custom, shared and smart lists) that opens the list on its own with a way back, Top 5 sits behind a Movies / TV switch, and the Lists view still shows each list in full. History's month grid is capped at 240 wide, as web caps it on a phone | **run in the iOS simulator against Staging (2026-11-12)** on a test account with sample titles: the Watching row, the Top 5 switch and podium, covers with a Public badge, a cover opening its list with the back row, and the capped month grid. **Not run**: Favorites (the flag is off), shared-list covers, the dark theme, Android |
| Upgrade on mobile is limited to where Apple allows a link out (#1373 opens Stripe Checkout in the browser; this limits it): `packages/core/purchaseLinkOut.js` lists the iOS storefronts (US only), the local `modules/plot-storefront` iOS module reads the App Store storefront, and `lib/usePremiumCheckout.ts` exposes `allowed`; the upgrade sheet and Settings > Premium draw no Upgrade control otherwise, and the closed-checkout state is the waitlist mailto (the old closed message is gone). No in-app purchase, ever (PLO-526). Android shows no control until Play's policy is checked. What to tell App Review: `docs/launch/app-review-notes.md` | **built and run in the iOS simulator (2026-10-17)**: a full dev build with the Swift module compiled (0 errors), and the Upgrade button showing on the simulator's US storefront. **Not run**: a non-US storefront (the control should be absent; the rule is unit tested), the waitlist state, tapping Upgrade (it would create a Stripe session). The dev client must be rebuilt once for the new native module |
| Calendar Agenda as web's "My dates" stream (`app/(app)/calendar.tsx`): every upcoming date from today forward under month headings with the count ("September  6 dates"), a day number and weekday column, and one row per title (poster, title, what the date is, network, the "1 episode behind" pill, chevron) split by hairlines, no cards. Grouping and row wording are shared with web in `@plot/core/calendar.js` (`groupCalendarEventsByDay`, `groupCalendarDaysByMonth`, `describeCalendarEvent`, `calendarEventMeta`, `calendarEventBehind`); the empty state and count use `CALENDAR_VIEW`. Web has no Agenda / Week / Month switch on a phone, so mobile keeps its own, drawn as web's segmented control; the period arrows show for Week and Month only, because the Agenda is no longer paged by month. The day list under Week and Month uses the same rows. Not brought across: web's All releases scope, the Show and Genre filters, title search, the Add upcoming sheet, and EPG reminders (mobile has no reminders data) | **run in the iOS simulator against Staging (2026-11-12)**: the Agenda with one upcoming episode showed the month heading with its count, the date column, and the row with poster, episode line, network and chevron; the three-way switch drew as a segmented control. **Not run**: Week and Month, the "behind" pill, several dates in a month, the dark theme, Android |
| Shared mobile components: screens that drew the same thing by hand now use one copy. `components/icons.tsx` (search, chevrons, close, check, plus), `SectionTitle.tsx`, `EmptyPrompt.tsx`, `Segmented.tsx` (Calendar's view switch), `RetryButton.tsx`, `ModalHeader.tsx`, alongside `BackBar.tsx`, `ReorderRows.tsx`, `QuietButton.tsx`, `HeaderRow.tsx`, `ListCover.tsx` and `ScreenHeaderBar.tsx`. A refactor meant to change nothing on screen. Left for a design decision because they differ today: search fields, poster rows, the primary and secondary buttons, bottom-sheet chrome, plain empty-state text | **static only**: not run on a device |

The upcoming feed had **three** independent implementations (web's
`UpcomingContent`, mobile's Upcoming tab, mobile's `HomeReleases`). All three
now run through `pickOutNow` / `groupFuture` in `packages/core/useUpcoming.js`.

## Left

These are interactive/visual mobile work. None should ship without running
the app — see the blocker below.

Top 5 drag-to-reorder is in the mobile working tree, not on main, and has not
been opened on a device. Edit mode keeps the ↑/↓ buttons. A vertical drag
lands on the slot under the finger (`moveToRank`, same as the web drop),
clamped to ranks 1 through 5. Down stops at the last filled rank.
`react-native-gesture-handler` and `reanimated` are not installed, so this
uses `PanResponder` and does not need a native rebuild.

Discover section headers and drawer icons are in the mobile working tree, not
on main. Headers follow live `DiscoverSectionHeader`: a display title with an
optional subtitle under it. That treatment was seen on the iPhone 17 Pro
simulator (Hot Right Now / Trending today, Out Today / New releases). The
drawer icons have not been opened on a device yet.
The old "uppercase kicker over uppercase title" note was stale, and web's
expand-all button is unused CSS, so mobile does not add it. Drawer rows use
the web nav strokes at 18px, including feedback, Support Plot, and an 18px
profile avatar. The drawer width matches web `min(300px, 85vw)`.

The onboarding and Finishing touches rows above passed `tsc`, ESLint,
`copy:check`, and have **not been opened on a device**: it
needs a fresh account to reach `/onboarding/seed`. Drive it once with a new
sign-up: the seed grid, the Switching apps? row into import and services, the
building fan and fade into Home, then the card (tiles tick from real data;
Import opens the existing import modal on the chosen source).
Differences from web that are deliberate: the card starts collapsed (web opens
it on wide screens only), the grid loads 24 trending titles rather than 48,
Following a person still hits the Free-tier upgrade sheet through
`useFollowPerson`, and there is no saved-title shortcut or checkout intent
(neither exists on mobile).

Settings gaps, rechecked against the code:

- **Username availability checking** was already on mobile, in
  `EditProfileModal` (the `username_available` RPC). The old note was stale.
- **Invite friends** has no web counterpart: web Settings has no such row, only
  an unused `inviteText` string in the shared copy. Mobile's Settings has the
  same profile share row web does. Nothing to match.
- **Data export** is on mobile (Privacy section: JSON and CSV through the share
  sheet). The fetch, file names and CSV flattening moved to
  `@plot/core/exportData.js`; web keeps only the browser download. Static
  checks only, not run on a device. On Android the share sheet carries the file
  contents as text, like the calendar snapshot, so a very large export may not
  fit there.
- **Avatar upload** is on mobile (Settings, Account: Add or Change photo, and
  Remove), via `expo-image-picker` with the system square crop, to the same
  `avatars/<user>/avatar.jpg` path as web. It adds a **native module**, so it
  only works in a **new binary**: an update delivered to an existing install
  without it would crash, the same reason `expo-sharing` is not used (see
  `lib/shareCalendarFile.ts`). Do not ship this branch over the air to old
  builds. Static checks only, not run on a device.

### Ko-fi on iOS is an unresolved App Review question

The drawer's **Support Plot** row is the first outbound donation link in the
iOS app. Before an App Store submission, decide whether to remove it or gate it
in `lib/launchFeatures.ts`; Apple guideline 3.1.1's donation carve-outs are not
an obvious fit for a Ko-fi tip to an individual developer.

## The app has now been run (2026-09-11)

For the first time, on a physical iPhone via an EAS `development` build. Before
that it had never executed at all, and `tsc --noEmit` plus ESLint were the
entire safety net under 25 mobile commits in 30 days.

The first run immediately justified itself, twice:

1. **It could not be built.** react-native had been bumped to 0.87.1 while Expo
   SDK 57 pins 0.86.3, so Expo's `ExpoReactNativeFactoryDelegate` no longer
   compiled. Nine packages were off the SDK's versions. `pnpm run mobile:deps`
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

**Xcode is still not the only path.** Plot is
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
- That gate no longer exists: Home has no sub-tabs now (one feed, New Releases at
  `/(app)/new-releases`), so there is no `mobile:tabs` check. Reachability of each
  screen is covered by `docs/qa/mobile-device-smoke.md`.

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
