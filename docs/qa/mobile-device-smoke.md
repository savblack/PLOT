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

## When you are done

Anything broken that is not already in `docs/agents/web-mobile-parity.md` gets
an issue. Then update the parity doc's blocker section, because as long as it
says the app cannot be built, everyone who reads it will keep assuming mobile
changes are static-only.
