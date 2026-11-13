# App Store listing: everything App Store Connect asks for, answered

Companion to [mobile-builds.md](mobile-builds.md), which covers getting a
build out. This file is what goes *into* App Store Connect, so the listing
can be filled in one sitting instead of answered question by question with
the app half-remembered.

Written 2026-10-14. Bundle ID `tv.theplot.app`, marketing version in
`apps/mobile/app.json`, build number owned by EAS (`appVersionSource: remote`).

## Seller: Individual, Savannah Black (decided 2026-11-12)

The Apple Developer account is an **Individual** membership (team
`FXZRAA8927`, "Savannah Black"), and the App Store seller is Savannah Black.
An Organization membership would need a legal entity with a D-U-N-S number,
which Plot does not have. If a company is registered later, Apple Developer
Support can convert the membership and keep the team ID; the seller name on
the listing changes when it goes through.

The legal copy matches the seller: Terms, Privacy and Community (web app and
the site's terms/privacy/community pages) say Plot is operated by Savannah
Black, with no trading name. EU trader details under the DSA are the personal
name and address.

**EU trader status (DSA).** Required before the app can be sold in the EU.
Done in App Store Connect ▸ Business ▸ Trader status. On an Individual
account the verified details are personal; on an Organization they are the
company's.

## Paperwork in App Store Connect (one afternoon)

- Agreements, Tax and Banking ▸ accept the **Paid Apps** agreement too, even
  though v1 sells nothing in-app: it needs banking and tax forms and takes
  Apple a day or two to approve, and it is the usual blocker when in-app
  purchase is added later.
- Users and Access ▸ Integrations ▸ **App Store Connect API key**, role App
  Manager. Download the `.p8` once (it cannot be re-downloaded) and give it to
  EAS with `eas credentials` ▸ iOS ▸ App Store Connect API Key. This is what
  lets `eas submit` run unattended. Done by 2026-11-12: EAS holds the key
  (`eas submit:status` reports "Using App Store Connect API Key from EAS
  credentials service"), and the build workflow uses it.
- My Apps ▸ **New App**: iOS, name "Plot", primary language English (AU or US,
  see below), bundle ID `tv.theplot.app`, SKU `plot-ios`. Copy the numeric
  Apple ID off the App Information page into `ascAppId` in
  `apps/mobile/eas.json`.

## Listing copy

Name, subtitle and keywords are the only fields App Store search reads, so
they are the ones to argue over. Everything else is read by humans.

| Field | Limit | Value |
| --- | --- | --- |
| Name | 30 | `Plot: Movie & TV Tracker` |
| Subtitle | 30 | `Watchlist, history, releases` |
| Primary category | | Entertainment |
| Secondary category | | Lifestyle |
| Keywords | 100 | `watchlist,movie tracker,tv tracker,series,episodes,letterboxd,trakt,streaming,calendar,diary` |
| Promotional text | 170 | `Everything you've watched and everything you want to watch, in one home. Free streaming alerts for your watchlist, and a calendar of what's coming.` |
| Support URL | | <https://theplot.tv/support> |
| Marketing URL | | <https://theplot.tv> |
| Privacy Policy URL | | <https://theplot.tv/privacy> |
| Copyright | | `2026 Savannah Black` |

Keywords: no spaces after commas, no words already in the name or subtitle
(Apple indexes those for free), competitor names are allowed as plain words.
"Plot" alone is not reservable as a name; the suffix is what makes it unique.

**Description** (4000 max; this is ~1100):

```
Plot is your personal movie and TV companion: for everything you've watched and everything you want to watch, all in one beautiful home.

SAVE IT FOR LATER
Add any film or series to your watchlist in a tap. Keep custom lists for anything: date nights, comfort rewatches, the whole Nolan back catalogue.

REMEMBER WHAT YOU WATCHED
Mark films and episodes as watched, rate them out of five, and keep a private note or a review. Your history builds into stats about how you actually watch.

KNOW WHAT'S ON
Discover what's trending, see new releases and what's coming up, and check the TV guide. Streaming alerts tell you when something on your watchlist arrives on a service you use, for free.

NEVER MISS A RELEASE
A calendar of upcoming films and episodes, built from your watchlist and the shows you follow.

BRING YOUR HISTORY WITH YOU
Import from Letterboxd, Trakt, Simkl, Plex or a Netflix viewing history CSV. Nothing is lost when you switch.

WATCH WITH FRIENDS
Follow people, compare taste, and see what your friends have saved. Profiles and watchlists are private by default, and you choose what to share.

Plot is free to use. Premium adds themes, smart lists, collaborative lists and more.

Film and TV data from TMDB. Streaming availability from JustWatch.
```

The Premium line stays price-free; the listing only says Premium exists. The
app shows the price, 7-day trial and Upgrade, which opens Stripe Checkout in the
browser (Manage subscription opens the Stripe portal). Limited to the US
storefront (Apple's Guideline 3.1.1 allows an external purchase link without an
entitlement only there), so Upgrade and Manage subscription draw nothing
elsewhere during App Review. Revisit the limit in `purchaseLinkOut.js` after
approval; see `docs/launch/app-review-notes.md`.

**What's New** for 1.0: `First release.` Nobody reads it on a first version.

**Primary language.** English (Australia) matches the company and the
spelling in the app ("favourite"). Search works the same in every English
storefront. Pick it once; it cannot change.

## Age rating

Apple's 2026 questionnaire, answered for what Plot actually does:

| Question | Answer | Why |
| --- | --- | --- |
| Cartoon or fantasy violence, realistic violence, sexual content, profanity, horror, drugs, alcohol, gambling, contests | None | Plot shows posters and plot summaries from TMDB; it does not play video. Poster art for adult-rated films is the only exposure and TMDB filters explicit titles by default |
| Unrestricted web access | No | WebView is used only for the Turnstile captcha and OAuth callbacks |
| User-generated content | Yes | reviews, notes, lists, profiles |
| Messaging / user interaction | Yes, between users | follows, watch together, shared lists |
| Medical or treatment information | No | |
| Mature or suggestive themes | Infrequent/Mild | film descriptions can describe adult themes |

Expected rating: **12+** (Infrequent/Mild Mature Themes). If App Review asks
for 17+ because of film artwork, accept it; it does not affect discovery.

## App privacy ("nutrition label")

Answer "Yes, we collect data from this app". Then, per data type. Everything
is linked to the user's identity because every row sits under their account.

| Data type | Collected | Linked to user | Used for tracking | Purpose |
| --- | --- | --- | --- | --- |
| Email address | Yes | Yes | No | App functionality (account), Developer's communications (lifecycle email via Brevo, which the user can turn off) |
| Name | Yes | Yes | No | App functionality (display name on profile) |
| Photos or videos | Yes, user-chosen avatar only | Yes | No | App functionality |
| User ID | Yes | Yes | No | App functionality, Analytics (PostHog identify) |
| Other user content | Yes (reviews, notes, lists, watch history, ratings) | Yes | No | App functionality |
| Product interaction | Yes | Yes | No | Analytics (PostHog events; no autocapture, no session replay on mobile) |
| Crash data | No | | | Nothing is wired for crash reporting on mobile |
| Coarse location | No | | | TMDB region comes from the device locale, not location |
| Contacts, precise location, health, financial, browsing history, search history, identifiers for advertising | No | | | |

"Used for tracking" is No throughout: Plot has no ad SDK, no cross-app
identifier, and PostHog data is not shared with data brokers. That also means
**no App Tracking Transparency prompt** is needed; do not add one.

Third parties the privacy policy already names and this label covers:
Supabase (database and auth), PostHog (analytics), TMDB (film data, no
personal data sent), Cloudflare (Turnstile and the TMDB proxy), Brevo
(email). Import sources (Letterboxd, Trakt, Simkl, Plex, Netflix CSV) are
user-initiated reads, not collection.

## Review notes and demo accounts

Guideline 1.2 (user-generated content) applies because of profiles and the
follow graph. The requirements already shipped: report and block
(`UserModerationMenu`), account deletion in Settings, community rules at
<https://theplot.tv/community>, contact email on the privacy page. The
reviewer still has to be able to *find* them, which is what the notes are for.

Two seeded demo accounts exist (GitHub #494, tracked in Linear PLO-226); the
second already follows the first so report and block have a target. Put the
credentials in the review notes, never in the description.

The review notes text lives in one place only:
[../launch/app-review-notes.md](../launch/app-review-notes.md). It covers the
demo sign-in, where report and block are, account deletion, and how Premium is
shown. An earlier copy here said the app shows no prices or purchase links,
which stopped being true when the US-only Upgrade button shipped (#1394). That
copy was removed on 2026-11-11 so the two cannot drift again.

## Screenshots

iPhone only for v1 (`supportsTablet: false` in `app.json`, decided
2026-10-14), so no iPad screenshots. Required sets:

| Device class | Size | Needed |
| --- | --- | --- |
| iPhone 6.9" (17 Pro Max class) | 1320 × 2868 | Yes, 3 to 10 |
| iPhone 6.5" (11 Pro Max class) | 1284 × 2778 or 1242 × 2688 | Yes |

The app still installs on an iPad as an iPhone app in a window; that is fine
and needs nothing from the listing.

Order and content:

1. Home with the Up next rail and a full-width Pick (the hero of the app).
2. A title panel with the Watched it? / Thoughts? foot bar filled in.
3. My Lists with a couple of custom lists and the status filter.
4. Calendar with upcoming episodes.
5. Discover ▸ New Releases with the Type and Genre filters.
6. A public profile with stats and the Favourites rail.

Caption each with one line of the app's own copy, not marketing adjectives.
Take them on an iPhone 17 Pro Max simulator with
`xcrun simctl io booted screenshot`, which gives the native 1320 × 2868; a
17 Pro gives 1206 × 2622, which App Store Connect rejects for the 6.9" slot,
so create the Max device type before capturing.

### Current set (2026-11-13, app 1.4.0)

Four screenshots, in this order: Home, the Ted Lasso title panel (Watching,
with Up next), My Lists (Watching row and Top 5 movies), History (2026 stats).
Taken on Savannah's own account against Production, light theme, status bar
set with `xcrun simctl status_bar <device> override --time 9:41
--batteryState discharging --batteryLevel 100`. Saved as JPEG (simulator
PNGs carry an alpha channel). The 6.5" files are the 6.9" ones scaled to
1284 wide and trimmed 12 px at the bottom.

App Store Connect's Media Manager (redesigned for iOS 27) groups by device:
"iPhone with Dynamic Island (large display)" is the 6.9" slot, "iPhone with
Face ID (large display)" is 6.5", and the required "medium display" slot
reuses the large set when it has none of its own.

Rules from Apple's asset best practices that shaped the set, so the next
retake does not have to rediscover them:

- Every image must suit a 4+ audience even though the app is rated 9+. Trending
  rails and a real account's Up next are full of guns and horror posters, so
  each shot was checked poster by poster. Family titles were added to
  Watching to lead Up next, and Top 5 #3 was changed.
- No prices, URLs, © symbols, or other platforms' logos. Streaming logos in
  "Where to watch" are why the title panel is Ted Lasso (Apple TV only).
- Left out on purpose: Calendar (showed "Nothing coming up" on 1.4.0 despite
  an episode due Dec 2, which looks like a bug), New Releases (weak, dark
  posters even when filtered), and the profile (shows a real name).

## Before pressing Submit

- [x] Seller settled (Individual, or a Pty Ltd converted) and the legal copy agrees with it.
      Decided 2026-11-12: Individual, Savannah Black. EU trader status (DSA)
      showed Active on 2026-11-13.
- [ ] Paid Apps agreement active; banking and tax complete. Not needed to
      submit a free app (the Free Apps agreement is Active), only before
      in-app purchase is ever added.
- [x] App record created; `ascAppId` in `eas.json` (`6797167864`).
- [x] Sign-in options meet Guideline 4.8: since 2026-11-12 the `production`
      EAS environment sets both `EXPO_PUBLIC_SHOW_APPLE_LOGIN` and
      `EXPO_PUBLIC_SHOW_GOOGLE_LOGIN`, so Google ships alongside Sign in with
      Apple (see [mobile-builds.md](mobile-builds.md), "Social sign-in
      status"). The review notes say so; on 2026-11-13 they were corrected
      from "No social sign-in is enabled". If either flag changes, update
      [../launch/app-review-notes.md](../launch/app-review-notes.md) too.
- [ ] The updated Apple Developer Program License Agreement is accepted.
      App Store Connect ▸ Business showed it waiting on 2026-11-13; until the
      Account Holder accepts it, no new submission goes through.
- [ ] A build is attached to the version (it showed "Add Build" on
      2026-11-13 although 1.4.0 builds 6 to 8 are in TestFlight).
- [ ] Release build drives the smoke list in
      [../qa/mobile-device-smoke.md](../qa/mobile-device-smoke.md), including
      a fresh sign-up and the demo account login.
- [x] Encryption: `ITSAppUsesNonExemptEncryption` is `false` in `app.json`
      (HTTPS only), so no export compliance form appears per build.
- [x] Content rights: `USES_THIRD_PARTY_CONTENT`, and the description names TMDB.
- [x] Release option: Manual release.
- [ ] The version in App Store Connect equals `expo.version` in
      `apps/mobile/app.json` **of the commit being built**. Release-please
      bumps that number on every mobile release (see
      [versioning.md](versioning.md)), so the app's number wins and App Store
      Connect is changed to match, never the other way round. #1428 set the
      app to 1.0.0 and the next release moved it to 1.2.0. This matters only
      when picking a build for review: TestFlight uploads go through without
      it (1.4.0 builds 6 to 8 were accepted on 2026-11-12 with App Store
      Connect at 1.2.0), and builds now reach TestFlight automatically (see
      [mobile-builds.md](mobile-builds.md)). App Store Connect showed 1.4.0
      on 2026-11-13, matching `app.json`; left unticked because the next
      release will move the app again, so check it right before submitting
      for review.
- [x] Review notes in App Store Connect are the current text from
      [../launch/app-review-notes.md](../launch/app-review-notes.md).

## Entered in App Store Connect (2026-10-15)

The app record already existed (SKU `plot-ios`, primary language English
(Australia), version 1.0, state Prepare for Submission). It was filled from
the tables above on the Individual account, so the seller name is Savannah
Black.

- Name, subtitle, keywords, promotional text, description, support URL,
  marketing URL, privacy policy URL, copyright, categories (Entertainment,
  Lifestyle), and manual release are set.
- Age rating questionnaire matches the table above. Apple computed **9+**.
  The earlier guess of 12+ was high. Leave it unless review asks otherwise.
- Privacy nutrition label matches the table above and is published. The
  previous draft declared contacts, crash data, location, device ID and
  purchase history. Those rows are gone.
- What's New stays empty. Apple rejects `whatsNew` on the first version.
- Review notes are filled. The demo login is `savannah+appreview@theplot.tv`
  (`plotreview`). `@plotreader` (`savannah+appreview2@theplot.tv`) follows it.
  The password is only in App Store Connect and was not committed.
- Screenshots: the October set of six (Home, Inception, My Lists, Calendar,
  New Releases, the plotreview profile) was replaced on 2026-11-13 by the four
  described under "Current set" above, in both the 6.9" and 6.5" slots. The
  old ones are still in the Asset Library. Not submitted.
- iOS 27 needs the UIScene lifecycle. `apps/mobile` is on
  Expo 57.0.29 with `ios.enableSceneSupport`. The `ios/` tree is gitignored,
  so EAS prebuild generates the AppDelegate on the builder.
- Production build 3 (`d27afc63-52ea-439c-8bc6-d00be0f1b969`) failed because
  the App Store profile had no Push Notifications or Sign in with Apple.
  Push is enabled on `tv.theplot.app`, the profile `P24BP4HULR` was
  regenerated (active, `aps-environment` production), and
  `expo-notifications` mode is `production` so the binary matches it.
  Build 4 is `b13803bd-21b4-49ed-9b28-4f02e183d9cf` (build number 4). It
  finished and was not submitted. It was built with the legacy anon JWT,
  which production now rejects, so it cannot load account data. The
  production EAS variable `EXPO_PUBLIC_SUPABASE_ANON_KEY` is the publishable
  key. Build 4 should not be the binary that goes to review.
- The updated Developer Program license is accepted, and the Free Apps
  agreement is the current contract (version 5032, in effect). The Paid Apps
  agreement is still New: agreeing needs a fresh Apple 2FA challenge, and
  banking and tax are empty. EU trader status is still unset. No App Store
  Connect API key has been created.
