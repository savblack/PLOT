# App Review notes

This is the one copy of the text that goes into App Store Connect, under the
version's App Review Information > Notes. `docs/ops/app-store-listing.md` points
here rather than keeping its own copy: on 2026-11-11 the two had drifted apart,
and App Store Connect held the older text, which told the reviewer the app shows
no prices or purchase links when the US build shows both.

The notes say plainly what the app does, so a reviewer who tests the purchase
button is not surprised by it. Re-read Apple's App Review Guidelines (1.2,
3.1.1(a) and 3.1.3) before each submission; the Premium part was written against
them on 2026-10-17, and the rules change.

## Notes to paste

The demo password is not in this repository. It is only in App Store Connect,
in the Sign-In Information fields next to these notes. Leave
`[password in Sign-In Information]` as it is, or replace it there by hand; never
commit it.

```
Plot is a movie and TV tracker. Everything in the app is free to use. Plot
Premium is an optional paid plan.

SIGNING IN
Sign in with email and password using the demo account below. No social
sign-in is enabled in this build.

Demo account: savannah+appreview@theplot.tv / [password in Sign-In Information]
Username: @plotreview
A second account, @plotreader, already follows it.

USER-GENERATED CONTENT (Guideline 1.2)
Open your profile, tap Followers, then tap @plotreader. The "..." menu at the
top right of that profile offers Report and Block. Reports are emailed to the
team and actioned within 24 hours.
Community rules: https://theplot.tv/community

ACCOUNT DELETION
Settings > Reset or delete data > Delete account.

PREMIUM
Premium is purchased on our website through Stripe, and the same account
unlocks Premium in the app. The app has no in-app purchase.

The app describes Premium and its price under Settings > plot Premium >
Explore Premium. On the United States storefront it also shows an "Upgrade to
Premium" button that opens our web checkout in the browser, as Guideline
3.1.1(a) allows. While web checkout is not yet open, that same button reads
"Join the waitlist" and only records interest; nothing is charged. On every other storefront the app shows no purchase button or link
and does not tell people how to buy. The app reads the storefront with
StoreKit's Storefront API and shows the button only when it is the United
States. If the storefront cannot be read, no button is shown. A member who
bought Premium on the web is recognized in the app on every storefront.

To see the button, use a device or simulator whose App Store storefront is the
United States, then open Settings > plot Premium > Explore Premium. It also appears
in the upgrade sheet shown when a Free account taps a Premium theme under
Settings > Themes.

CONTENT
Film and TV metadata and artwork come from TMDB under its API terms. The app
does not play video.
```

## Checklist before each submission

- Sign in with the demo account on a Release build. If the password has
  rotated, App Review's first reply will be "we could not sign in", which costs
  a 24 to 48 hour cycle.
- The demo account should be on the Free plan, or the upgrade sheet and the
  button will not appear for the reviewer.
- The button is storefront-gated in code: `packages/core/purchaseLinkOut.js`
  (the list of storefronts) and `apps/mobile/modules/plot-storefront` (reads it).
  Confirm the list still matches Apple's current text. Only the US needs no
  entitlement. Other regions need a StoreKit External Purchase Link Entitlement
  and approved destinations, which we have not applied for.
- The App Store listing (description, screenshots, promo text, what's new) must
  not tell people to buy on the web. Outside the US, metadata may not carry
  calls to action to external purchase either. Screenshots of the upgrade sheet
  should be the US variant only, or omitted.
- Test the button on a US storefront and confirm it is absent on a non-US one
  (change the simulator or device's App Store region, or test with a non-US
  Apple ID).
- The Terms say Premium is purchased on the web and billed by Plot through
  Stripe, which matches the above.
- If a menu path above changes (Settings rows, the profile "..." menu), update
  this text in the same pull request.
- Android: no purchase button is shown at all until Google Play's payments
  policy has been read and a rule added.
