# Mobile first-run smoke

The first time `apps/mobile` executes, this is what to drive and in what order.

This is not the web launch checklist ([public-launch-checklist.md](public-launch-checklist.md))
with the nouns changed. That one assumes a working app and hunts for product
bugs. This one assumes nothing: the app has never run, so it starts by asking
whether it boots, and it is ordered so that the things which would invalidate
everything after them come first.

How to get it running at all: [docs/ops/mobile-builds.md](../ops/mobile-builds.md).

## Before you start

- **Use a Staging account, not a production one.** Mobile reads the same
  Supabase project the app is configured for, and PLOT has live users.
- **Mobile analytics land in the production PostHog project.** There is no host
  allowlist on mobile the way there is on web (`apps/web/src/utils/analyticsHost.js`
  gates web to three production hosts; mobile has no equivalent). Everything
  below will fire real events. Either accept that and make sure the account is
  caught by PostHog's test-account filter, or expect to clean up.
- Have `docs/agents/web-mobile-parity.md` open. It lists what is known missing
  on mobile, so you do not spend time reporting an absence that is already known.
- Write down what you find as you go. The first run will produce a list, and
  the list is the point.

## Phase 0a: the two things that stop it launching at all

Neither is a bug, both look like one, and both cost a confused ten minutes the
first time.

- [ ] **Developer Mode.** iOS 16+ refuses to run an internally-distributed
      build until it is on: tapping the icon gives "PLOT requires Developer Mode
      to run". Settings ▸ Privacy & Security ▸ Developer Mode ▸ on, restart the
      phone, then confirm at the prompt with your passcode. The menu item only
      appears once a development-signed app is installed, so it will not be
      there before the first install. One-time, per device.
- [ ] **Metro is running**, if this is a `development` (dev-client) build:
      `npx expo start --dev-client` in `apps/mobile`, phone on the same network.
      Without it you get the dev-launcher screen with nothing to connect to,
      which reads as a broken app but is not one. A `preview` build is
      standalone and needs none of this.

## Phase 0: does it boot

Everything else is void if these fail, and each has a distinctive symptom.

- [ ] The app launches to something other than a blank screen. A permanently
      blank themed background means `useFonts` never resolved (root `_layout.tsx`
      renders `ThemedBlank` until fonts load, with no timeout and no failure
      branch).
- [ ] You do not land on the `ErrorBoundary` screen. If you do, that is a
      render-time throw and the message is the whole story.
- [ ] No red-box or console error mentioning `getConfig` or a missing config
      value. `lib/configureCore.ts` is imported first in `app/_layout.tsx`
      specifically so core is configured before any data call; if that ordering
      broke, every Supabase and TMDB call fails at once.
- [ ] Data actually arrives from Supabase and TMDB (any populated rail proves
      both). An app that boots to empty rails everywhere is a config failure,
      not an empty database.

## Phase 1: the RN 0.87 regression surface

Do this second, before anything fun. It is the one change in #622 that is not
inert at runtime, and its failure mode is silent: everything looks fine.

`components/GuideView.tsx` scrolls its ruler and sidebar by calling `scrollTo()`
on sibling `ScrollView` refs. RN 0.87 made `ScrollView` a function component, so
`useRef<ScrollView>` stopped describing the instance and the refs were retyped to
`ComponentRef<typeof ScrollView>`. That satisfied `tsc`. Whether it still holds a
real instance with a real `scrollTo` is unverified.

- [ ] Open Home → Guide.
- [ ] **Scroll the grid horizontally.** The time ruler along the top must move
      with it and stay aligned. If the ruler stays frozen while the grid moves,
      `rulerRef.current?.scrollTo({ x })` is a no-op and the ref is wrong.
- [ ] **Scroll the grid vertically.** The channel sidebar down the left must
      move with it and stay aligned. Same failure, `sidebarRef`.
- [ ] Both at once, then let go. Nothing drifts out of alignment.

The `?.` on those calls means a broken ref throws nothing and logs nothing. Only
your eyes catch this.

## Phase 2: auth and first-run

Use a brand new account. This is the path every launch user takes and it has
never been walked.

- [ ] Sign up. You land in onboarding, not in the app and not in a loop.
- [ ] `AuthGuard` in `app/_layout.tsx` redirects off `segments[0]`. Watch for a
      flicker between `(auth)` and `(app)` or a redirect that fires repeatedly:
      that is the guard fighting itself.
- [ ] Onboarding step 1 (name) saves.
- [ ] Onboarding step 2 (seed picks) saves, and the picks are actually in your
      watchlist afterwards. `onboarding/seed.tsx` was one of the files retyped
      for RN 0.87 (`ListEmptyComponent` null → undefined).
- [ ] You reach the app. Kill the app and reopen it: you are still signed in
      (session persistence through AsyncStorage) and you are **not** sent back
      through onboarding.
- [ ] Sign out, sign back in.

## Phase 3: every tab is reachable and renders its own content

`npm run mobile:tabs` now guards the classification statically, but it cannot
tell you that a tab renders the *right* thing. #587 is the reason this section
is explicit.

Bottom tab bar (`app/(app)/_layout.tsx`): Home, Calendar, My Lists, Settings,
Profile.

- [ ] All five tabs are present and tappable.
- [ ] The tab bar's `BlurView` renders as blur, not as an opaque block or a
      transparent gap, in both light and dark.

Home sub-tabs (from `DISCOVER_TABS`): Discover, New Releases, Upcoming, Guide.

- [ ] All four appear.
- [ ] Each shows **content distinct from the others**. Two tabs showing the
      same rails means one fell through to the default branch of the ternary
      chain in `app/(app)/index.tsx`.
- [ ] Type and Genre filters appear on Discover, New Releases and Upcoming, and
      not on Guide.
- [ ] Applying a genre filter hides the hero on Discover (web's behaviour: one
      card is not a rail, so the hero is dropped rather than filtered).

## Phase 4: every remaining screen opens

One pass, just to see them render. Details come later.

- [ ] Search, and open a result.
- [ ] My Lists, including each of its sub-tabs.
- [ ] Calendar.
- [ ] Notifications (the header bell), and Follow requests.
- [ ] Your own Profile, and someone else's via `u/[username]`.
- [ ] Settings. `(app)/settings.tsx` was the third file retyped for RN 0.87.
- [ ] The drawer menu opens and closes.
- [ ] The media panel opens from a card on **each** surface that offers one
      (Discover, Search, My Lists, Calendar). It is mounted once at the root
      off `MediaPanelContext`, so a surface that fails to open it is a wiring
      bug local to that surface.

## Phase 5: the writes

This is what PLOT is for, and every one of these is a Tier 2 activation event
in `docs/analytics/README.md`. A write that fails here fails for every launch
user.

- [ ] Save to watchlist, and confirm it persists across an app restart.
- [ ] Mark something watched.
- [ ] Set a rating.
- [ ] Favourite something.
- [ ] Add to a custom list; create a custom list.
- [ ] Start watching a show and tick an episode, then un-tick it.
- [ ] Edit a watched date.
- [ ] Run an import through `ImportHistoryModal` (Letterboxd, Netflix or CSV).
      This one carries extra weight: import is the lever the launch plan names
      as mattering more than Statistics, because Statistics renders empty
      without it.

## Phase 6: deep links and cold start

`app.json` registers `applinks:app.theplot.tv` and the `plot` scheme, with
`/save`, `/list` and `/u` path prefixes on Android.

**Read the two notes below before you spend device time here.** Both were
written on 2026-09-13 from the source alone, with no simulator and no device.
The first was **confirmed on a simulator on 2026-09-14** and is now a result.
The second is still a prediction, because a development build cannot test it —
see the run log.

**Only one of the three declared paths has a route** — confirmed on device
2026-09-14: `/save` and `/list` both land on expo-router's development
"Unmatched Route" screen. `apps/mobile/app/` has
`(app)/u/[username].tsx` and nothing for `/save` or `/list`, and nothing else in
the app parses an incoming URL (`_layout.tsx` handles only the Trakt code,
`(auth)/callback.tsx` only the auth callback). Both are real routes on web —
`/save` is `SavePage`, `/list` redirects to `/my-lists` — so the links exist and
get sent. On Android the intent filter claims those two prefixes explicitly; on
iOS `applinks:app.theplot.tv` claims the whole host, so **every** app.theplot.tv
link opens the app, including paths mobile has never heard of. There is also no
`app/+not-found.tsx`, so the landing place is expo-router's development
"Unmatched Route" screen. If that is what you see, it is not a linking failure —
the link arrived and there was nowhere to put it.

**The AuthGuard race is closed — settled on a Release build, 2026-09-14.**
Earlier drafts of this phase said to expect the cold-start case to fail, on the
reasoning that the link resolves before the session loads and the guard
redirects away from it. That was wrong on both counts: `RootInner` returns a
loader until `authReady`, so `AuthGuard` and its `<Slot/>` do not mount until
`getSession()` has resolved; and `AuthGuard`'s three branches each test an
explicit value, so the `onboardingComplete === null` window matches none of them
and redirects nowhere. Watched: killed process, fresh pid, straight onto the
deep-linked profile. Do not re-derive this from the old warning.

- [ ] With the app **already running**, open an `app.theplot.tv/u/<username>`
      link. It opens in PLOT, on that profile.
- [ ] With the app **fully killed**, open the same link. This is the cold-start
      case above: it should land on the profile rather than the home tab. If it
      lands on home, the guard is eating the link after all — say so here.
- [ ] Signed **out**, open the same link. It should reach `(auth)`; note whether
      signing in then returns you to the profile or drops you on home (there is
      no "return to" memory in `AuthGuard`, so expect home).
- [ ] `/save/...` and `/list/...`: confirm what actually happens, given neither
      has a route. What is worth recording is which screen the user ends up on.
- [ ] The Trakt callback returns into the app (`consumeTraktState` /
      `exchangeTraktCode` run at the root layout).

## Phase 7: iOS presentation

- [ ] Light and dark both render. Toggle the system appearance with the app
      open: the status bar style follows (`ThemedStatusBar` reads
      `resolved` from `ThemeContext`).
- [ ] On a notched device nothing is under the notch or the home indicator, and
      the floating tab bar clears the bottom inset.
- [ ] Rotate. `app.json` pins `orientation: "portrait"`, so it should not.
- [ ] Scroll to the bottom of a long list: content clears the tab bar rather
      than sitting behind it (`TAB_BAR_CLEARANCE`).

## Run log

Append a line per real run. An unrecorded run is indistinguishable from no run,
which is how the repo ended up asserting things about an app nobody had opened.

### 2026-09-11/12 — the first ever run

iPhone, EAS `development` build, Metro pointed at **Staging**
(`uzrhfivnhdcfieuaxzip`). Passed: 0, 0a, 1, 3, 4, 5, 7.

Two real bugs, neither visible to `tsc` or ESLint:

- **The app could not be built.** react-native had drifted a minor above what
  Expo SDK 57 supports; nine packages were off. Fixed and now guarded by
  `npm run mobile:deps`.
- **The EPG was misaligned by ~7 rows.** The Guide's ruler ScrollView had a
  height but no pinned `flexGrow`, so it grew into the column's spare space and
  pushed the programme grid 355pt below the channel sidebar. Found by measuring
  with `onLayout`, not by reading the code — the stylesheet looks correct.

**Still outstanding:**

- **Phase 2 beyond session persistence.** Signing out, signing up fresh and
  completing onboarding has never been done on mobile. Session persistence
  across a force-quit is confirmed; the fresh-account path is not. This is the
  path every launch user takes and it writes in a loop in `onboarding/seed.tsx`.
- **Phase 6 deep links**, both warm and cold start.

### 2026-09-14 — first run on a simulator

iOS Simulator, iPhone 17 Pro on iOS 26.5, Xcode 26.6, local `expo run:ios`
development build, Metro pointed at **Staging** (`uzrhfivnhdcfieuaxzip`). Signed
in as `sav-black`. Phase 6 warm start and the block render; everything else
untouched this run.

**Two ways to lose an hour before the app even builds**, both now fixed:

- **The simulator had zero device types.** Xcode installed fine and both iOS
  runtimes downloaded and reported Ready, but `xcrun simctl list devicetypes`
  returned nothing, so there was no iPhone to create. The 124 profiles in
  `/Library/Developer/CoreSimulator/Profiles/DeviceTypes` were left over from an
  earlier Xcode and carry no screen geometry at all — CoreSimulator rejects each
  one with `Missing keys to define the main screen`, visible only in
  `~/Library/Logs/CoreSimulator/CoreSimulator.log`. Neither
  `xcodebuild -runFirstLaunch` nor reinstalling `XcodeSystemResources.pkg` fixed
  it; the installer rewrote the receipt and the CoreSimulator framework but
  skipped that whole tree. **The fix needs no admin rights:** CoreSimulator also
  reads `~/Library/Developer/CoreSimulator/Profiles/DeviceTypes`, so expanding
  the package and copying its profiles there is enough.

  ```sh
  pkgutil --expand-full /Applications/Xcode.app/Contents/Resources/Packages/XcodeSystemResources.pkg /tmp/xsr
  mkdir -p ~/Library/Developer/CoreSimulator/Profiles/DeviceTypes
  ditto /tmp/xsr/Payload/Library/Developer/CoreSimulator/Profiles/DeviceTypes \
        ~/Library/Developer/CoreSimulator/Profiles/DeviceTypes
  ```

- **CocoaPods dies without a UTF-8 locale.** An agent shell starts with `LANG`
  unset and `LC_CTYPE=C`, so Ruby reads the working directory as ASCII-8BIT and
  `pod install` aborts inside `Pod::Config#installation_root` with
  `Unicode Normalization not appropriate for ASCII-8BIT`. The message names
  Unicode and never mentions the locale, so it reads like a corrupt path. Export
  `LANG=en_US.UTF-8` and `LC_ALL=en_US.UTF-8` before any local iOS build.

**Results:**

- [x] **Warm start, signed out.** `plot://u/test-1` leaves the app on `(auth)`.
      iOS showed its "Open in PLOT?" confirmation first, so the scheme really is
      registered and the link really did reach the app.
- [x] **Warm start, signed in.** `plot://u/test-1` opens straight on that
      profile, correctly rendered as a private account.
- [x] **`/save` and `/list` have no route, and it looks exactly as bad as you
      would guess.** `plot://save/12345` and `plot://list/abc123` both land on
      expo-router's **development** "Unmatched Route — Page could not be found"
      screen, complete with `Go back · Sitemap` developer links and rendered in
      dark theme while the app is in light. `app.json` claims both prefixes on
      Android, and on iOS `applinks:app.theplot.tv` claims the whole host, so a
      real `app.theplot.tv/save/...` link opens PLOT and dead-ends here. Both are
      live routes on web. **This is the one finding from this run that needs a
      fix, not a note.**
- [x] **The block not-found render, watched on device at last.** From test-1's
      profile: ··· → Block → confirm, and the card is replaced in place by
      "This profile isn't public / @test-1 either doesn't exist or hasn't made
      their profile public yet." No navigation, no blank frame, no stale card.
      Identical to web. Staging was returned to 0 blocks, 0 reports, 0 follows.
- [ ] **Cold start cannot be tested in a development build.** Killing the app
      and opening the link hands the cold launch to the **Expo Dev Launcher**,
      which shows its own server picker before any PLOT code runs. Retested the
      same day against a Release build — see below.

### 2026-09-14 — same day, Release build

`npx expo run:ios --configuration Release`, same simulator and Staging account.
`main.jsbundle` is embedded and the dev launcher is excluded, so this is what a
shipped build does. The session survived the reinstall.

- [x] **Cold start passes, and the `AuthGuard` prediction holds.** Proven by pid
      rather than by eye: the running app (pid 27035) was `kill -9`'d and
      confirmed gone, `plot://u/test-1` launched a **fresh process** (pid 27690),
      and it landed directly on test-1's profile, still signed in. No bounce to
      `(auth)`, no redirect to home. `authReady` gates the guard's mount and
      `onboardingComplete === null` matches none of its three branches, exactly
      as reading the source suggested. **The original Phase 6 note telling you to
      expect this to fail was wrong.**
- [x] **`/save` and `/list` show the developer error screen to real users.**
      `plot://save/12345` and `plot://list/abc123` both render expo-router's
      "Unmatched Route — Page could not be found" screen **in Release**, black,
      with `Go back · Sitemap` developer links and the raw URL. This screen is
      **not** dev-only, which is the assumption worth killing: a shipped PLOT
      build hands a user who taps `app.theplot.tv/save/...` a black screen
      offering them a route sitemap.

**Method note, learned the hard way.** `timeout` does not exist on this shell,
so a command written as `timeout 60 xcrun simctl openurl ...` prints whatever
you echo after it and never runs the simctl call — it looks exactly like "the
deep link did nothing". `xcrun simctl terminate` also silently left the process
alive more than once. **Verify a cold start by pid** (`pgrep -f "PLOT.app/PLOT"`
before and after), never by screenshot alone.

**Still outstanding after this run:** Phase 2 fresh signup.

**Which project a build talks to** (fixed 2026-09-12; it used to be Production
for all three):

| EAS environment | Supabase project |
| --- | --- |
| `development` | Staging (`uzrhfivnhdcfieuaxzip`) |
| `preview` | Staging (`uzrhfivnhdcfieuaxzip`) |
| `production` | Production (`mkegtssedjyqldysvzga`) |

This mattered because a standalone `preview` build, or a dev client falling back
to its embedded bundle, would otherwise have been writing to the live database.
It was masked during the first run only because the dev client takes its config
from the local `apps/mobile/.env`, which is Staging.

**The trap, if you ever change these again:** `EXPO_PUBLIC_SUPABASE_URL`,
`..._ANON_KEY` and `..._TMDB_PROXY_URL` were each a *single* EAS variable linked
to all three environments, so "update the development one" would have repointed
**production** at Staging as well. They are now split — one variable scoped to
`production`, a second scoped to `development, preview`. Check
`eas env:list <env> --format long` and read the `Environments` line before
editing any of them.

Staging's key is a `sb_publishable_*` key (46 chars) while production still uses
the legacy JWT `eyJhbG...` anon key (208 chars). Both are correct; the formats
differ because the projects were created at different times.

Still not repointed: `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN` and
`EXPO_PUBLIC_TURNSTILE_SITE_KEY` carry production values in `development` and
`preview`. Those are already per-environment variables, so they are safe to
change; whether test builds should fire into the production PostHog project is a
separate decision from database safety.

## When you are done

Anything broken that is not already in `docs/agents/web-mobile-parity.md` gets
an issue. Then update the parity doc's blocker section, because as long as it
says the app cannot be built, everyone who reads it will keep assuming mobile
changes are static-only.
