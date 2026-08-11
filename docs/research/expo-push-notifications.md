# Shipping iOS push notifications on PLOT mobile

Research for issue #483. Sources are Expo's official documentation, the `expo-notifications`
changelog in the Expo monorepo, the npm registry, and Apple Developer documentation. Every
claim below carries a link. Blog posts and Stack Overflow were deliberately not used.

## Stack facts, as verified against the repo

The ticket's stated stack is accurate apart from one detail. `apps/mobile/package.json`
pins `expo` at `~56.0.18`, `expo-router` at `~56.2.17`, and **React Native at `0.85.3`, not
0.86**. `expo-notifications` is indeed absent from the dependency list. `expo-constants` is
already present at `~56.0.16`, which matters because the push setup needs it.

`apps/mobile/app.json` already sets `scheme: "plot"`, `ios.bundleIdentifier:
"tv.theplot.app"`, `ios.associatedDomains: ["applinks:app.theplot.tv"]`, and
`extra.eas.projectId: "af5eb12a-a0c5-41b0-9d14-5bef0b2279ab"`. The `plugins` array contains
`expo-router`, `expo-font`, `expo-status-bar`, `expo-secure-store` and the datetimepicker.
There is no notifications plugin entry yet.

`apps/mobile/.gitignore` line 7 ignores `ios/`, and no `ios/` directory exists in a fresh
worktree, which confirms the continuous native generation setup. `apps/mobile/eas.json` has
development, preview and production build profiles and an empty `submit.production`.

One more repo fact worth carrying into the design: the exact use case in scope already
exists as an email job. `supabase/functions/watchlist-availability-alerts/index.ts` is a
daily, idempotent cron function that matches watchlist titles against the user's selected
streaming providers and region and sends a Resend email. Push is therefore a second delivery
channel on an existing pipeline, not a new pipeline.

## 1. The correct package version and what changed

The npm registry's `sdk-56` dist-tag for `expo-notifications` resolves to **56.0.23**
(`npm view expo-notifications dist-tags`). The install command is the one that reads that
tag, so it should be used rather than a hand-written version:

```
npx expo install expo-notifications expo-constants
```

Expo's setup guide names both packages, because `expo-notifications` handles permissions and
token generation while `expo-constants` supplies the `projectId`.
(https://docs.expo.dev/push-notifications/push-notifications-setup/)

The only breaking change in the 56 line is in 56.0.0, dated 2026-05-05: the minimum
iOS and tvOS deployment target moved to 16.4 and macOS to 13.4 (expo/expo#43296).
56.0.0 also exposed a typed config plugin function (expo/expo#44098) and added an explicit
`import React` on iOS for xcframework compatibility (expo/expo#44248).
(https://github.com/expo/expo/blob/main/packages/expo-notifications/CHANGELOG.md)

Two late 55.x changes are worth knowing because they are inherited by 56 and affect how the
client should be written. 55.0.21 made the library skip redundant device push token
registration when the token and metadata are unchanged since the last successful
registration, so calling the registration path on every launch is cheap rather than wasteful.
55.0.10 and 55.0.11 fixed `requestPermissionsAsync` not forwarding new options to the OS when
notifications were already granted, and fixed it returning a raw permission result missing
several documented fields. Anything written against pre-55.0.11 behaviour should not be
copied. (same changelog)

The iOS 16.4 floor is not a practical constraint for a launch in 2026, but it should be
recorded because it is a hard minimum for the whole app once the dependency is added.

## 2. Apple-side setup

### APNs authentication key, not certificates

Token-based authentication with a `.p8` signing key is the current approach and the one Expo
builds around. Apple's own documentation states that one APNs signing key can authenticate
tokens for multiple apps, that the key works for both the development and production
environments, and that the key does not expire although it can be revoked. The `.p8` file is
downloadable only once, is not retained in the developer account, and must be stored
securely. APNs accepts only provider tokens signed with ES256, and rejects anything else with
`InvalidProviderToken` (403). A provider token whose issue timestamp is not within the last
hour is rejected with `ExpiredProviderToken` (403).
(https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns
and https://developer.apple.com/help/account/keys/create-a-private-key/)

Certificates are the older model: one certificate per app per environment, with annual
renewal. There is no reason to choose them here.

Expo's credentials documentation adds three constraints that matter operationally. An Apple
Developer account may hold a maximum of **2 APNs keys**. A single key can be used with any
number of apps. Revoking a key stops push for every app that relies on it until a new key is
uploaded, and uploading a new APNs key does not change users' existing Expo push tokens.
Keys that Expo generates can be downloaded from the Expo website.
(https://docs.expo.dev/app-signing/app-credentials/)

Since PLOT is enrolled in the Apple Developer Program and has never submitted an app, the
2-key budget is untouched. The practical instruction is: let EAS generate the key, and treat
it as an account-level asset rather than an app-level one.

### The Push Notifications capability and how it survives a regenerate

The capability is expressed as the `aps-environment` entitlement. The `expo-notifications`
config plugin writes it, and Expo's documentation is explicit that the value is always set to
`development` in the generated project, with Xcode changing it to `production` in the archive
produced by a release build. This is automatic and should not be hand-edited.
(https://docs.expo.dev/versions/v56.0.0/sdk/notifications/)

The interaction with a gitignored `ios/` folder is the important part. Under continuous
native generation the native directories are treated as build artifacts. Expo's documentation
warns that manual edits to the generated directories are at risk of being lost the next time
`npx expo prebuild --clean` runs, and directs all native customisation through config plugins
declared in the app config, which becomes the single source of truth.
(https://docs.expo.dev/workflow/continuous-native-generation/)

So the answer to "does prebuild preserve capabilities" is: not as Xcode state, but it does not
need to, because it regenerates them from the app config every time. What must live in
`app.json` to survive a regenerate is the plugin entry itself:

```json
[
  "expo-notifications",
  {
    "icon": "./assets/notification-icon.png",
    "color": "#0c0c0c",
    "enableBackgroundRemoteNotifications": false
  }
]
```

The plugin options are `icon`, `color`, `defaultChannel` and `sounds` (of which `icon`,
`color` and `defaultChannel` are Android-only), plus `enableBackgroundRemoteNotifications`,
which is iOS and adds `remote-notification` to `UIBackgroundModes` in Info.plist. That last
one should stay `false` for PLOT's launch scope, because a "now streaming" alert is a visible
alert, not a silent background wake.
(https://docs.expo.dev/versions/v56.0.0/sdk/notifications/)

Anything else needed on the native side belongs in `ios.entitlements` in `app.json`, never in
Xcode.

## 3. How EAS Build handles push credentials

EAS Build synchronises capabilities on the Apple Developer Console with the local entitlements
configuration when `eas build` runs. Push Notifications is a supported capability and maps to
the `aps-environment` entitlement. For an Expo project the capabilities are read from the
`ios.entitlements` field of the app config, which can be inspected with
`npx expo config --type introspect`. The sync can be disabled with `EXPO_NO_CAPABILITY_SYNC=1`,
which is exactly what should not be done here. Provisioning profiles have to be regenerated
after a capability change or the build fails.
(https://docs.expo.dev/build-reference/ios-capabilities/)

On credentials specifically, Expo's setup guide states that a paid Apple Developer account is
required to generate them, and that during first-time EAS Build setup you are prompted to
enable push notifications and generate a new APNs key. Credentials can also be driven
explicitly with `eas credentials` (or `eas credentials --platform ios`).
(https://docs.expo.dev/push-notifications/push-notifications-setup/ and
https://docs.expo.dev/app-signing/app-credentials/)

The ordered checklist before a build:

1. Add the dependency and the plugin entry to `app.json`.
2. Run `npx expo prebuild --clean -p ios` so the entitlements file is regenerated with
   `aps-environment`.
3. Run `eas credentials -p ios` (or let the first `eas build` prompt) to create the APNs key
   and let EAS store it against the `tv.theplot.app` App ID.
4. Run `eas build -p ios --profile development` so the capability sync reaches Apple and the
   provisioning profile is reissued.
5. Register the physical test device with the Apple account before that internal-distribution
   build, since the development and preview profiles both use `distribution: "internal"`.

A local `npx expo run:ios` build does not go through EAS and therefore does not sync the
capability to the App ID. The capability must be established once through an EAS build (or by
hand in the developer console) before local builds can receive real pushes.

Separately, `submit.production` in `eas.json` is empty. Submission is not a prerequisite for
push, but TestFlight is the realistic way to test a production-entitlement build, and EAS
Submit needs an App Store Connect app record to exist first plus an `ascAppId` in the submit
profile, with an App Store Connect API key as the recommended authentication method (set up
via `eas credentials --platform ios`). That is a separate piece of work.
(https://docs.expo.dev/submit/ios/)

## 4. Token registration, storage and refresh

### What the client must do

There are two token types and PLOT should use the Expo one. `getExpoPushTokenAsync(options)`
returns an Expo push token and requires a `projectId`, which defaults to
`Constants.expoConfig.extra.eas.projectId` and is already set in `app.json`.
`getDevicePushTokenAsync()` returns the raw APNs token and is only needed if you talk to APNs
directly. Expo's documentation warns that `getExpoPushTokenAsync` makes requests to Expo's
servers and should be wrapped in try/catch with retry logic so the token can be fetched later
once the device is back online.
(https://docs.expo.dev/versions/v56.0.0/sdk/notifications/)

Tokens are not permanent. Expo exposes `addPushTokenListener(listener)` for the rare case
where the push service rotates the token while the app is running. On the Apple side, tokens
change across app reinstall, device restore and similar events, which is why the token has to
be re-read and re-sent rather than fetched once and cached forever.
(https://docs.expo.dev/versions/v56.0.0/sdk/notifications/ and
https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns)

The client responsibilities, then:

- Read permission status, and on iOS read `ios.status` rather than the root `status` field,
  because iOS permissions are more granular. The possible values are `NOT_DETERMINED`,
  `DENIED`, `AUTHORIZED`, `PROVISIONAL` and `EPHEMERAL`.
- Fetch the Expo push token after authorisation, with retry.
- Upsert the token to Supabase on every cold start, not only the first. The library already
  skips redundant native registration internally as of 55.0.21, so the launch-time call is
  cheap.
- Subscribe with `addPushTokenListener` and upsert on rotation.
- Call `setNotificationHandler` to decide foreground presentation. The handler must respond
  within 3 seconds and the default is not to display the notification.
- Clear the stored token when the user signs out, so the next account on that device does not
  inherit alerts.

### What the backend must store

The token itself is the routing key, so the Postgres table should be keyed on it:

- `token` text, unique, primary routing key
- `user_id` uuid referencing the profile, with a foreign key and `on delete cascade`
- `platform` text, so Android can be added later without a schema change
- `device_name` or similar, optional, only useful for a settings screen listing devices
- `created_at`, `last_seen_at`, so stale rows can be pruned
- `disabled_at` or `revoked_at`, set when Expo reports the device is gone

One user can have many tokens (multiple devices), and one token belongs to exactly one user at
a time, so the upsert should be on `token` with `user_id` overwritten. Row level security
should let a user read and write only their own rows, with the cron job using the service role
key as `watchlist-availability-alerts` already does.

### Sending from a Deno edge function

The Expo Push API endpoint is `https://exp.host/--/api/v2/push/send`, POSTed as JSON. It
accepts a single message object or an array of up to **100 messages** per request, and the
project-level rate limit is **600 notifications per second**. The total notification must not
exceed 4096 bytes, with the custom `data` object capped around 4 KiB. Message fields include
`to`, `title`, `body`, `data`, `sound`, `badge`, `categoryId`, `channelId`, `priority` and
`ttl`. Exceeding limits produces `TOO_MANY_REQUESTS` or `PUSH_TOO_MANY_NOTIFICATIONS`.
(https://docs.expo.dev/push-notifications/sending-notifications/)

The send response returns tickets, not delivery confirmation. Receipts must be fetched
separately from `https://exp.host/--/api/v2/push/getReceipts` with up to 1000 ticket ids per
request. Expo recommends checking roughly 15 minutes after sending, and receipts are retained
for 24 hours. Where a receipt carries `"details": {"error": "DeviceNotRegistered"}` the
documentation is explicit that you must stop sending to that token until it re-registers.
That is the mechanism that drives the `disabled_at` column above, and it needs its own
scheduled pass rather than being folded into the send.
(https://docs.expo.dev/push-notifications/sending-notifications/)

Expo also offers enhanced push security: an opt-in setting on the EAS dashboard that requires
an access token on every push request, sent as `Authorization: Bearer ${accessToken}`.
Without it, anyone holding a leaked Expo push token can send notifications that appear to come
from PLOT. Requests without a token then fail with `UNAUTHORIZED`. This should be switched on,
with the token held as a Supabase function secret alongside the existing
`AVAILABILITY_ALERTS_CRON_SECRET` and `RESEND_API_KEY`.
(https://docs.expo.dev/push-notifications/sending-notifications/)

The official `expo-server-sdk-node` assumes Node, so in the Deno edge runtime plain `fetch`
against the two endpoints is the pragmatic choice, matching how
`watchlist-availability-alerts` already calls Resend and Sentry directly. The existing caps in
that function (`MAX_EMAILS_PER_RUN`, `MAX_TMDB_CALLS_PER_RUN`, concurrency limits) give a
template for the equivalent push caps, and the 100-per-request batch size plus the
600-per-second ceiling are the numbers to size them against.

## 5. Deep linking into the notification centre with expo-router

Expo Router handles deep link routing automatically, and Expo's linking guide says outright
that Expo Router users can skip the manual `getInitialURL` and `addEventListener` handling.
(https://docs.expo.dev/linking/into-your-app/)

For notifications specifically, the documented pattern is to put the destination in the
notification's `data` payload and route on it:

```ts
const url = notification.request.content.data?.url;
if (typeof url === 'string') {
  router.push(url);
}
```

Two APIs deliver the tap. `addNotificationResponseReceivedListener(listener)` fires when the
user interacts with a notification, with `actionIdentifier` equal to
`Notifications.DEFAULT_ACTION_IDENTIFIER` for a plain tap. `useLastNotificationResponse()`
returns the most recent interaction and is the one that covers the cold start case, where the
tap happened before any listener could be attached. It is paired with
`clearLastNotificationResponseAsync()`, which must be called after routing, otherwise the hook
keeps returning the same response and the app re-navigates.
(https://docs.expo.dev/versions/v56.0.0/sdk/notifications/)

For PLOT the payload should carry a router path such as
`data: { url: "/notifications" }`, or a title-specific path when the alert is about one
title. The `scheme` is already `plot` and `applinks:app.theplot.tv` is already an associated
domain, so no linking configuration changes are needed.

There is a repo-specific hazard here. `apps/mobile/app/_layout.tsx` contains an `AuthGuard`
that runs `router.replace('/(auth)')`, `router.replace('/onboarding/name')` or
`router.replace('/(app)')` from an effect keyed on `session`, `onboardingComplete` and
`segments`. A notification route pushed before the session and onboarding state have resolved
will be replaced out from under itself. Notification routing must therefore be deferred until
the session is non-null and `onboardingComplete === true`, and the pending URL held until
then. This is the single most likely source of a "the notification opens the app but lands on
the wrong screen" bug, and it will only show up on cold start.

## 6. Permission timing and Apple's rules

Apple's App Review Guidelines, section 4.5.4, in full:

> Push Notifications must not be required for the app to function, and should not be used to
> send sensitive personal or confidential information. Push Notifications should not be used
> for promotions or direct marketing purposes unless customers have explicitly opted in to
> receive them via consent language displayed in your app's UI, and you provide a method in
> your app for a user to opt out from receiving such messages. Abuse of these services may
> result in revocation of your privileges.

Guideline 5.1.2(i) reinforces it: an app may not require users to enable system functionality
such as push notifications in order to access functionality, content, use the app, or receive
compensation. Guideline 5.1.1(ii) requires user consent for collection of user or usage data
even where that data is anonymous at the time of collection.
(https://developer.apple.com/app-store/review/guidelines/)

A "a title on your watchlist is now streaming" alert is a functional alert about content the
user explicitly saved, not direct marketing, so 4.5.4's opt-in-consent clause is not strictly
triggered. It is still the right shape to satisfy it anyway: an in-app toggle for the alert,
defaulted off, plus an in-app way to turn it back off. That also matches the existing email
alert, which is already a per-user preference.

On timing, the system prompt can only be shown once. Asking on first launch, before the user
has a watchlist, spends that one prompt on a user who has no reason to say yes. The
point-of-value moment is the first time a title is saved to the watchlist, or the moment the
user turns the alert on in Settings. This is the same shape as PLOT's existing preference for
deferring auth prompts to the point of action.

`requestPermissionsAsync` takes an `ios` object supporting `allowAlert`, `allowBadge`,
`allowSound`, `allowCriticalAlerts`, `allowProvisional`, `allowDisplayInCarPlay` and
`provideAppNotificationSettings`. Setting `allowProvisional: true` requests the ability to
post noninterrupting notifications provisionally to the Notification Center, which means no
system prompt at all: alerts are delivered quietly and the user is offered "Keep" or "Turn
Off" on the notification itself.
(https://docs.expo.dev/versions/v56.0.0/sdk/notifications/)

Provisional authorisation is a genuinely attractive option for this specific use case. It
removes the prompt entirely, lets the user see a real "now streaming" alert before deciding,
and converts on evidence rather than on a promise. The cost is that provisional notifications
do not appear on the lock screen as banners and make no sound, so a user who never opens
Notification Center never sees them. Given PLOT is relaunching to a small audience and the
alert is low-frequency, the recommendation is: request provisional at first watchlist save,
and offer an explicit "make these alerts louder" upgrade in Settings that requests full
authorisation. Note that `getPermissionsAsync` returns `PROVISIONAL` as a distinct
`ios.status`, so the two states are distinguishable in code.

## 7. App Privacy label and App Store Connect implications

Apple defines "collect" as transmitting data off the device in a way that allows you or your
third-party partners to access it for longer than is necessary to service the transmitted
request in real time. Storing an Expo push token in Supabase against a `user_id` is squarely
collection.
(https://developer.apple.com/app-store/app-privacy-details/)

The disclosure that follows:

- **Identifiers / Device ID**, since the push token is a device-level identifier. Purpose:
  App Functionality. Linked to the user's identity, because it is stored against `user_id`.
- **Identifiers / User ID** is already implied by PLOT's accounts and is not newly triggered
  by push, but the push table makes the linkage explicit.

Apple's optional-disclosure exemption does not apply. It requires all four conditions to hold,
including that collection is infrequent, not part of the app's primary functionality, and
user-provided through a clear interface with affirmative choice each time. A push token
persisted for a recurring alert feature fails at least the second and fourth conditions. The
page is also explicit that collecting data solely for app functionality is not an exemption:
you declare it and mark the purpose as App Functionality.
(https://developer.apple.com/app-store/app-privacy-details/)

Third-party partners must be disclosed too, and the page defines those to include third-party
SDKs and external vendors whose code is in the app. The Expo push service receives the token
and the notification content, so it belongs in that assessment. PostHog is already in the app
and already carries its own label obligations, so the privacy questionnaire is not being
filled in from scratch.

Two smaller App Store Connect notes. The app has never been submitted, so the privacy
questionnaire has to be completed before the first submission regardless of push; adding push
just adds a row. And `ios.infoPlist.ITSAppUsesNonExemptEncryption` is already `false` in
`app.json`, and adding push notifications does not change that answer.

## 8. Pitfalls specific to the prebuild workflow

**Adding the dependency does not add it to the existing dev client.** `expo-notifications`
contains native code. The current development build on any device was compiled without it, so
the JS will fail at runtime until `npx expo prebuild` runs and the dev client is rebuilt and
reinstalled. This trips people who expect the managed-workflow experience of an instant
reload.

**Manual Xcode changes are worthless here.** With `ios/` gitignored and regenerable, toggling
the Push Notifications capability in Xcode's Signing and Capabilities tab survives exactly
until the next `npx expo prebuild --clean`. Everything must go through the plugin entry in
`app.json` or `ios.entitlements`.
(https://docs.expo.dev/workflow/continuous-native-generation/)

**The `aps-environment` entitlement is always `development` in the generated project.** Expo
documents this and relies on Xcode flipping it to `production` when producing a release
archive. The consequence is that a locally built debug app talks to the APNs sandbox while an
EAS production build talks to production APNs, and a token obtained from one environment is
not valid in the other. When a token that worked in development stops working in TestFlight,
this is why. Expo's push service abstracts the routing, but the token still has to be
re-registered from the build you are actually testing.
(https://docs.expo.dev/versions/v56.0.0/sdk/notifications/)

**Capability sync happens at `eas build` time, not at prebuild time and not at
`expo run:ios` time.** Building locally will not create the capability on the Apple App ID.
Run at least one EAS build after adding the entitlement, and expect the provisioning profile
to be reissued.
(https://docs.expo.dev/build-reference/ios-capabilities/)

**Device registration precedes internal-distribution builds.** Both the development and
preview profiles in `eas.json` use `distribution: "internal"`, and Expo's setup guide lists a
registered iOS device as a prerequisite before running `eas build` for development.
(https://docs.expo.dev/push-notifications/push-notifications-setup/)

**Simulator limits.** Expo documents that the iOS Simulator needs Xcode 14 or later on
macOS 13+ with iOS 16+ for notifications, and recommends a physical device for real testing.
Push behaviour around cold start and lock screen presentation is not faithfully reproduced in
the simulator anyway.
(https://docs.expo.dev/push-notifications/push-notifications-setup/)

**Cold start routing is the flaky path.** Covered in section 5. The combination of
`useLastNotificationResponse`, the `AuthGuard` effect in `_layout.tsx`, and
`clearLastNotificationResponseAsync` needs deliberate handling and a manual test that force
quits the app before tapping the notification.

**Receipts are a separate job, not a response check.** A 200 from the send endpoint means
Expo accepted the ticket, not that APNs delivered anything. Without the 15-minute receipt
sweep, dead tokens accumulate silently and there is no signal when delivery is failing.
(https://docs.expo.dev/push-notifications/sending-notifications/)

## Suggested order of work

1. Install `expo-notifications` at the SDK 56 version, add the plugin block to `app.json`.
2. `npx expo prebuild --clean -p ios`, then `eas credentials -p ios` to generate the APNs key.
3. First `eas build -p ios --profile development` to sync the capability and reissue the
   profile; install on a registered physical device.
4. Supabase migration for the device-token table plus RLS.
5. Client registration hook: permission check, provisional request at first watchlist save,
   token fetch with retry, upsert on launch and on `addPushTokenListener`, clear on sign out.
6. Notification centre screen and the deferred cold-start routing, tested from a force-quit.
7. Extend `watchlist-availability-alerts` to send push alongside email, batched at 100 per
   request, gated on the user's preference.
8. Separate receipt-sweep function that marks `DeviceNotRegistered` tokens disabled.
9. Turn on enhanced push security and store the access token as a function secret.
10. Complete the App Privacy questionnaire with Device ID under App Functionality before the
    first submission.

## Source list

- https://docs.expo.dev/versions/v56.0.0/sdk/notifications/
- https://docs.expo.dev/push-notifications/push-notifications-setup/
- https://docs.expo.dev/push-notifications/sending-notifications/
- https://docs.expo.dev/app-signing/app-credentials/
- https://docs.expo.dev/build-reference/ios-capabilities/
- https://docs.expo.dev/workflow/continuous-native-generation/
- https://docs.expo.dev/linking/into-your-app/
- https://docs.expo.dev/submit/ios/
- https://github.com/expo/expo/blob/main/packages/expo-notifications/CHANGELOG.md
- https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns
- https://developer.apple.com/help/account/keys/create-a-private-key/
- https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/app-store/app-privacy-details/
