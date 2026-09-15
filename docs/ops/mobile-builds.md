# Mobile builds: what runs where, and what each path needs

`apps/mobile` has never been executed. Every change since the app was started
has been verified by `tsc --noEmit` and ESLint and nothing else, and there are
25 mobile commits in the last 30 days sitting on top of that, including the RN
0.86.2 to 0.87.1 and Expo 57.0.14 to 57.0.19 upgrades in #622.

One nuance, from `eas build:list` on 2026-09-11: **one build does exist.** A
`production` / store-distribution iOS build finished on 2026-08-02 (SDK 56.0.0,
version 1.0.0, build number 1). It is the only build in the project's history.
A store-distribution `.ipa` cannot be sideloaded, and the app has never been
submitted, so it was never installed anywhere and nothing about it contradicts
the above. What it does prove is useful: the EAS pipeline and the Apple signing
credentials worked once already, on an SDK that is now one major behind.

This doc is about getting it to run. The checks to run once it does are in
[docs/qa/mobile-device-smoke.md](../qa/mobile-device-smoke.md).

## Account status: enrolled, as an individual

Confirmed 2026-09-11. PLOT is enrolled in the Apple Developer Program on an
**Individual** membership. That retires what was the longest lead time on the
launch path: TestFlight, APNs, Sign in with Apple and submission are all
available now, gated only on setup rather than on waiting for Apple.

(An earlier revision of this doc recorded a contradiction between
`docs/research/expo-push-notifications.md` and `apps/web/src/launchFeatures.js`
over whether enrolment existed. The research doc was right.)

### The one thing to settle before publishing

An Individual membership publishes under **your own legal name**. Every legal
surface PLOT already ships says something different:

> PLOT is a product of SUSUMU HOUSE, registered office Level 1, 63-73 Ann
> Street, Surry Hills, NSW 2010

That wording is in `TermsPage.jsx`, `PrivacyPage.jsx`, the marketing site's
`terms.html` and `privacy.html`, all six Supabase auth email templates and the
newsletter footer (#599). So the App Store listing would name a person as the
seller while the thing it links to says you are contracting with a business.

Two further consequences of the Individual type:

- **EU distribution requires DSA trader verification**, and the verified trader
  details are shown publicly on the listing. On an individual account those
  default to the account holder's own details. Having SUSUMU HOUSE's registered
  office already in use helps, but confirm in App Store Connect what will
  actually be displayed before the listing goes public.
- **Individual memberships cannot add team members** in App Store Connect. Not
  a problem for a solo project, and App Store Connect **API keys are still
  available**, so the `eas submit` automation below works either way.

Publishing under SUSUMU HOUSE instead means an Organization membership, which
needs a D-U-N-S number. Converting an existing individual account is possible
but goes through Apple support, and it is materially easier to settle before an
app is published than after. **This is a decision, not a bug** — publishing as
an individual is perfectly legitimate, and plenty of good apps do. It just
should be a choice, and the legal copy should agree with whatever is chosen.

### Running locally on a simulator

**Working as of 2026-09-14.** Xcode 26.6, iOS 26.5 simulator runtime, and the
app has been built and driven on an iPhone 17 Pro simulator — see the run log in
[docs/qa/mobile-device-smoke.md](../qa/mobile-device-smoke.md). Before that date
this machine had no Xcode at all, and older revisions of this file and of
`docs/agents/web-mobile-parity.md` say so; ignore them.

Getting there cost two hours, almost none of it spent on PLOT. Both traps are
worth knowing because neither error names its own cause.

**1. The simulator can have zero device types.** Xcode installs, runtimes
download and report `Ready`, and `xcrun simctl list devicetypes` still returns
nothing — so there is no iPhone to create and no obvious reason why. The profiles
in `/Library/Developer/CoreSimulator/Profiles/DeviceTypes` can be left over from
an earlier Xcode and carry no screen geometry, which CoreSimulator rejects. The
only place that says so is `~/Library/Logs/CoreSimulator/CoreSimulator.log`:

```
Error ... Code=402 "Missing keys to define the main screen:
  .../iPhone 17 Pro Max.simdevicetype/Contents/Resources/profile.plist"
```

`xcodebuild -runFirstLaunch` does not fix it, and neither does reinstalling
`XcodeSystemResources.pkg` — the installer rewrites the receipt and the
CoreSimulator framework but skips that tree. **The fix needs no admin rights,**
because CoreSimulator also reads the per-user profiles directory:

```sh
pkgutil --expand-full /Applications/Xcode.app/Contents/Resources/Packages/XcodeSystemResources.pkg /tmp/xsr
mkdir -p ~/Library/Developer/CoreSimulator/Profiles/DeviceTypes
ditto /tmp/xsr/Payload/Library/Developer/CoreSimulator/Profiles/DeviceTypes \
      ~/Library/Developer/CoreSimulator/Profiles/DeviceTypes
```

**2. CocoaPods needs a UTF-8 locale.** An agent shell starts with `LANG` unset
and `LC_CTYPE=C`, so Ruby reads the working directory as ASCII-8BIT and
`pod install` aborts in `Pod::Config#installation_root`:

```
Unicode Normalization not appropriate for ASCII-8BIT (Encoding::CompatibilityError)
```

It names Unicode and never mentions the locale, so it reads like a corrupt path.
Export both before any local iOS build:

```sh
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd apps/mobile && npx expo run:ios --device "<simulator name>"
```

**What a development build cannot test.** The Expo Dev Launcher owns the cold
launch, so killing the app and opening a deep link shows its server picker
rather than exercising PLOT's startup. Cold-start behaviour needs
`npx expo run:ios --configuration Release`.

Installing Xcode itself still needs a human: the App Store wants an Apple
Account password and `xcode-select -s` wants the machine password.

## Where a build stops today (measured 2026-09-11)

Running the CLI rather than reasoning about it, the state is:

- **Logged in to EAS** as `savblack`. Apple team resolves as
  **Savannah Black (Individual), `FXZRAA8927`** — independent confirmation of
  the Individual membership above.
- **Config is already in place.** The `development` and `preview` EAS
  environments both carry `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_TMDB_PROXY_URL` and `EXPO_PUBLIC_TURNSTILE_SITE_KEY`, so a build
  will boot with real config rather than dying in `configureCore`.
- **`expo-dev-client` was missing.** The `development` profile sets
  `developmentClient: true`, but the package was never a dependency, so that
  profile failed immediately with "you don't have expo-dev-client installed".
  Fixed on 2026-09-11 by adding `expo-dev-client ~57.0.18`.
- **Zero devices are registered** on the Apple team
  (`eas device:list --apple-team-id FXZRAA8927` → "Could not find devices").
  Both `development` and `preview` now stop at exactly the same place:

  ```
  ✔ Using remote iOS credentials (Expo server)
  Failed to set up credentials.
  EAS CLI couldn't find any credentials suitable for internal distribution.
  ```

That is the single remaining blocker, and it is the one thing that cannot be
done from a terminal: internal distribution means ad-hoc provisioning, which
needs at least one registered device.

### Registering the iPhone

```sh
cd apps/mobile && npx eas-cli device:create
```

Choose the website method. It prints a URL and a QR code; open it **on the
iPhone**, install the profile it offers, and the device is registered. Takes a
couple of minutes, needs the phone in hand, and will ask for an Apple login,
which is why it is not scripted here. After that, `eas build --profile preview
--platform ios` runs unattended.

## Build profiles

In `apps/mobile/eas.json`. EAS builds on hosted macOS workers, so **none of
these need Xcode locally** to produce an artifact. Xcode only matters for
running the simulator artifact afterwards.

| Profile | Produces | Use it for |
| --- | --- | --- |
| `development` | Dev-client build, internal distribution | **Start here.** Day-to-day work against your own iPhone, with fast refresh |
| `simulator` | Unsigned `.app` for the iOS Simulator | Once Xcode is installed. Needs no signing at all |
| `preview` | Ad-hoc iOS build; Android APK | Sharing a fixed build with someone |
| `production` | Store build, `autoIncrement` on | TestFlight and submission |

```sh
# Signed for your own device. Register the iPhone when prompted.
cd apps/mobile && npx eas-cli build --platform ios --profile development

# Unsigned, for a local simulator. Only useful once Xcode is installed.
cd apps/mobile && npx eas-cli build --platform ios --profile simulator
```

`eas-cli` is not a dependency and does not need to be; `npx eas-cli` is the
documented way to run it.

### The Android APK

Previously recommended here as a way around a missing Apple account. With
enrolment confirmed it is no longer the shortcut it would have been: a signed
iOS build on your own iPhone is both easier and tests the actual launch
platform. Keep the Android APK for when Android itself is on the roadmap.

### Expo Go

Worth ten minutes before anything else, because it needs nothing at all:
`npx expo start` and scan the QR with Expo Go on an iPhone. Do not plan around
it, though. `app.json` declares config plugins (`expo-router`, `expo-font`,
`expo-status-bar`, `expo-secure-store`, `@react-native-community/datetimepicker`),
and config plugins exist to modify native code, which Expo Go cannot do. Treat
a successful Expo Go launch as a bonus, not the plan.

## Submitting

`submit.production` is deliberately still `{}`. An empty submit profile makes
`eas submit` prompt interactively, which is the right default until the App
Store Connect record exists, and empty-string placeholders would be worse than
nothing.

Once the app record for `tv.theplot.app` exists, fill in:

```json
"submit": {
  "production": {
    "ios": {
      "appleTeamId": "FXZRAA8927",
      "ascAppId": "<App Store Connect app ID>"
    }
  }
}
```

`appleTeamId` is already filled in (read off the account, not a secret: team IDs
ship inside every provisioning profile). Only `ascAppId` is outstanding, and it
does not exist until the App Store Connect app record does.

An App Store Connect API key is the recommended authentication method over an
Apple ID, per the research in `docs/research/expo-push-notifications.md`, which
also covers the APNs key (let EAS generate it; the account cap is 2 keys) and
the `aps-environment` entitlement trap.

`appVersionSource: "remote"` means EAS owns the build number and `production`
increments it. Do not also bump `version` in `app.json` by hand per build; that
is the marketing version, not the build number.

## Order of operations

1. **Build `development` for iOS and get it onto your iPhone.** Nothing is
   waiting on anything now. The first execution will find things, and finding
   them now is worth more than finding them in App Store review at 24 to 48
   hours per rejection cycle.
2. Work [the smoke checklist](../qa/mobile-device-smoke.md) against it,
   Phase 1 (GuideView) first.
3. In parallel: App Store Connect agreements, banking and tax, then the app
   record for `tv.theplot.app` and the `ascAppId` above. Agreements in
   particular block submission and are pure paperwork.
4. Settle the seller-name question above before the listing is public.
5. Install Xcode when convenient, for the faster local loop.
