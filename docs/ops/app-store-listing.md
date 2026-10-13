# App Store listing: everything App Store Connect asks for, answered

Companion to [mobile-builds.md](mobile-builds.md), which covers getting a
build out. This file is what goes *into* App Store Connect, so the listing
can be filled in one sitting instead of answered question by question with
the app half-remembered.

Written 2026-10-14. Bundle ID `tv.theplot.app`, marketing version in
`apps/mobile/app.json`, build number owned by EAS (`appVersionSource: remote`).

## Seller: SUSUMU HOUSE (decided 2026-10-14)

The Apple Developer account is an **Individual** membership (team
`FXZRAA8927`, "Savannah Black"). Every legal surface Plot ships says "a
product of SUSUMU HOUSE, registered office Level 1, 63-73 Ann Street, Surry
Hills, NSW 2010", so the listing should too. That means converting the
membership to **Organization** before the app record is created.

What converting takes, in order:

1. **D-U-N-S number for SUSUMU HOUSE.** Check first at
   <https://developer.apple.com/enroll/duns-lookup/>. If none exists, request
   one through the same page; Apple says up to 5 business days (Australian
   entities usually land in 1 to 2). Free. You need the legal entity name
   exactly as registered, the registered office above, and an ABN helps.
2. **Authority to sign.** Organization enrolment asks whether you have the
   legal authority to bind the company. If you are the owner or a director,
   answer yes; otherwise Apple wants a letter from someone who is.
3. **Contact Apple Developer Support** to convert the existing membership
   rather than enrolling again: <https://developer.apple.com/contact/>
   ▸ Membership and Account ▸ "Convert to an organization". Converting keeps
   the team ID, certificates and the EAS credentials; a fresh enrolment would
   not. Apple verifies the D-U-N-S against the entity (a phone call is normal)
   and typically completes in a few days to two weeks.
4. **A website that shows the company**: theplot.tv's footer and legal pages
   already name SUSUMU HOUSE, which is what Apple checks.
5. After conversion, re-run `eas credentials` once so EAS re-syncs the team.
   The team ID should not change.

Until this is done: do not create the App Store Connect app record and do not
run `eas submit`. Builds are fine.

**EU trader status (DSA).** Organization accounts verify as a trader with the
company's details, which is exactly what should be public. Done in App Store
Connect ▸ Business ▸ Trader status, before the app can be sold in the EU.

## Paperwork in App Store Connect (one afternoon)

- Agreements, Tax and Banking ▸ accept the **Paid Apps** agreement too, even
  though v1 sells nothing in-app: it needs banking and tax forms and takes
  Apple a day or two to approve, and it is the usual blocker when in-app
  purchase is added later.
- Users and Access ▸ Integrations ▸ **App Store Connect API key**, role App
  Manager. Download the `.p8` once (it cannot be re-downloaded) and give it to
  EAS with `eas credentials` ▸ iOS ▸ App Store Connect API Key. This is what
  lets `eas submit` run unattended.
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
| Copyright | | `2026 SUSUMU HOUSE` |

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

The Premium line is deliberately price-free. The iOS build hides every price,
trial note and Upgrade button behind `SHOW_PREMIUM_PRICING` in
`apps/mobile/lib/launchFeatures.ts`, because App Review Guideline 3.1.1
rejects a price or a call to action for a subscription the app does not sell
through in-app purchase, and Plot sells Premium on the web. Do not add a
price, "cheaper on the web", or a checkout link anywhere in the listing or
the app until in-app purchase exists. Mentioning that Premium exists is fine.

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

Review notes text:

```
Plot is a movie and TV tracking app. Sign in with the demo account below
(email + password; no social sign-in is enabled in this build).

Demo account: <email> / <password>
A second account, @<username2>, already follows it.

To reach moderation (Guideline 1.2): open Profile tab > Followers > tap
@<username2> > the "..." menu at the top right offers Report and Block.
Reports are emailed to the team (notify-report) and actioned within 24 hours.
Community rules: https://theplot.tv/community

Account deletion: Settings > Reset or delete data > Delete account.

Premium is not sold in this app and the app shows no prices or purchase
links. Features marked Premium are listed for information only.

Film and TV metadata and artwork come from TMDB under its API terms; the app
does not play video.
```

Fill in the three placeholders from the seeded accounts. If the demo password
has rotated, App Review's first response will be "we could not sign in",
which costs a 24 to 48 hour cycle: test the login on a Release build before
submitting.

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

## Before pressing Submit

- [ ] Membership converted to Organization; seller shows SUSUMU HOUSE.
- [ ] Paid Apps agreement active; banking and tax complete.
- [ ] App record created; `ascAppId` in `eas.json`.
- [ ] `EXPO_PUBLIC_SHOW_APPLE_LOGIN` is **not** set in the `production` EAS
      environment (confirmed 2026-10-14), so no social sign-in ships and
      Sign in with Apple is not required by Guideline 4.8. If Google is ever
      turned on for iOS, Apple must be too.
- [ ] Release build drives the smoke list in
      [../qa/mobile-device-smoke.md](../qa/mobile-device-smoke.md), including
      a fresh sign-up and the demo account login.
- [ ] Encryption: `ITSAppUsesNonExemptEncryption` is `false` in `app.json`
      (HTTPS only), so no export compliance form appears per build.
- [ ] Content rights: tick "yes, I have rights" for TMDB and JustWatch data,
      and name TMDB in the description (its API terms require attribution).
- [ ] Release option: Manual release, so the web, newsletter and the App Store
      go live on the same day.
