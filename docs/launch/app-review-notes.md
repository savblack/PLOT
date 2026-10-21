# App Review notes: how Premium is sold

Paste the text below into App Store Connect, under the build's App Review
Information > Notes. It says plainly what the app does, so a reviewer who tests
the purchase button is not surprised by it. Re-read Apple's App Review Guidelines
(3.1.1(a) and 3.1.3) before each submission; this was written against them on
2026-10-17, and the rules change.

## Notes to paste

> Plot is a movie and TV tracker. Everything in the app is free to use. Plot
> Premium is an optional paid plan.
>
> Premium is purchased on our website through Stripe, and the same account
> unlocks Premium in the app. The app has no in-app purchase.
>
> On the United States storefront the app shows an "Upgrade to Premium" button
> that opens our web checkout in the browser, as App Review Guideline 3.1.1(a)
> allows. On every other storefront the app shows no purchase button or link
> and does not tell people how to buy. The app reads the storefront with
> StoreKit's Storefront API and shows the button only when it is the United
> States. If the storefront cannot be read, no button is shown. A member who
> bought Premium on the web is recognised in the app on every storefront.
>
> To see the button: sign in with the demo account below, open Settings, then
> Premium, on a device or simulator whose App Store storefront is the United
> States. Another place it appears is the upgrade sheet shown when a Free
> account taps a Premium feature, for example Pick for Me.
>
> Demo account: [add an email and password for a Free test account here]

## Checklist before each submission

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
- Android: no purchase button is shown at all until Google Play's payments
  policy has been read and a rule added.
