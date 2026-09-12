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

- [ ] With the app **already running**, open an `app.theplot.tv/save/...` link.
      It opens in PLOT, on the right title.
- [ ] With the app **fully killed**, open the same link. This is the case the
      `expo-notifications` research flags as racing `AuthGuard`: the link
      resolves before the session loads, the guard redirects to `(auth)` or
      `(app)`, and the deep link is lost. Expect this one to fail.
- [ ] `/u/<username>` and `/list/...` likewise.
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
