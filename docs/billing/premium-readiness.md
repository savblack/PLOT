# Plot Premium readiness

Reviewed 16 September 2026. This is a build assessment, not evidence of a live payment test.

## Product decision

Keep the recorded US$3/month or US$24/year price (four months free against monthly). Keep tracking,
watch history, discovery, statistics, imports and data exports free. Existing lists
must remain accessible after cancellation. Launch Premium around unlimited custom
lists and a live release calendar. Treat Plex/Trakt sync as a later addition until
credentials, background jobs, error recovery and mobile parity have been verified.
Do not advertise automatic tracking from every streaming service: Trakt integration
is not equivalent to direct integrations with Netflix, Disney+ and Prime.

The approved wider scope also includes free watchlist notes; Premium collaborative
lists and shared-watchlist intersections, a tonight picker, smart lists, movie and
episode release alerts, actor/director alerts, full-season-ready alerts and
configurable widgets. Leaving-service alerts depend on verified provider coverage.
These are product decisions, not claims that those features are implemented.
Integration delivery and remaining work are tracked in
[migration-tracking.md](migration-tracking.md).

## Competitor cross-check

Official sources accessed 16 September 2026. Prices below are displayed dollar
amounts; regional checkout prices and tax were not independently verified.

| Product | Paid offer | Implication for Plot |
| --- | --- | --- |
| [Letterboxd](https://letterboxd.com/pro/) | Pro $19/year: statistics, streaming filters/alerts, no ads. Patron $49/year adds custom artwork and presentation. Unlimited lists are free. | A list limit alone is not a compelling differentiator. Journal presentation fits Plot better than charging for basic tracking. |
| [SIMKL](https://simkl.com/vip/) | Pro $34.99/year. VIP $34.99 every six months adds reviews of viewing periods, calendar sync, backup and exports. Lifetime $249. | Calendar sync is an established paid convenience. Keep Plot data export free as already promised. |
| [Trakt May 2026 product update](https://forums.trakt.tv/t/trakt-product-update-may-2026/111812) | Official direction: useful free tracking and casual Plex sync; VIP for heavier use, multiple servers, near-real-time sync and deeper control. | Basic sync is becoming less distinctive. Current checkout price could not be verified; do not reuse the old US$60 figure as a fresh quote. |

## Existing implementation and changes in this branch

- Stripe Checkout, customer portal, signed webhook, database entitlements and
  calendar feed already exist. Public pricing and media-sync flags remain disabled.
- Shared, web, and marketing prices are US$3/month and US$24/year. The server accepts 300 and 2400 cents.
- Move plans copy into core and retain the web shim. Show calendar benefits and free
  statistics/export instead of promising unavailable sync.
- Preserve the selected plan through anonymous signup.
- Show payment confirmation pending until the profile confirms entitlement.
- Require STRIPE_CHECKOUT_ENABLED=true on the server, an explicit supported plan,
  and an active USD Stripe price matching the advertised amount and interval.
- Fail closed when the billing-account lookup fails, rather than creating another
  checkout after a database error.

## Required before accepting payments

1. **Licence:** TMDB clearance confirmed by Savannah. This is not a launch
   blocker. Historical quotes are not used as current cost assumptions.
2. **Checkout concurrency:** `claim_billing_checkout` takes a per-user row lock
   and a two-minute lease. Customer creation uses idempotency key
   `plot-customer-<user id>`. Session creation uses `plot-checkout-<operation id>`.
   An open session is reused. Any subscription that is not `canceled` or
   `incomplete_expired` sends the member to the portal instead of a second
   Checkout. Coverage: `supabase/functions/_shared/checkout.test.ts`. Two
   browsers against staging were not re-run for this change.
3. **Webhook durability:** signature verification rejects a missing or invalid
   `Stripe-Signature` before any write. `apply_stripe_subscription_event`
   inserts `stripe_events` in the same transaction as the billing row, so a
   repeated event id does not apply twice. Handled events: `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`,
   `invoice.payment_succeeded`, and `invoice.paid`. Invoice events refetch the
   subscription and write that status. They do not invent one from the invoice.
   Staging rollback tests still stand. A signed production delivery of this set
   was not run for this change. See
   [test evidence](stripe-test-verification.md#subscription-and-access-follow-up-2026-09-23).
4. **Entitlement consistency:** web now reads the authoritative entitlement and
   retains billing management after expiry. The new badge write uses the database
   grace policy. Staging backend rollout is complete; actual signed payment activation is pending;
   native wiring remains deferred.
5. **Lifecycle proof in Stripe test mode:** purchase both plans; delayed activation;
   decline; renewal; failed renewal and recovery; cancel at period end; resume;
   plan switch; expiry; portal access after loss of entitlement. Prove list data
   survives downgrade and the calendar feed stops granting expired access.
6. **Native payments (PLO-526): decided, there will be none.** Plot has no
   in-app purchase route: no StoreKit, no Play Billing, no RevenueCat, and so no
   App Store Connect or Play Console subscription products to set up.
   Premium is bought on the web only. Mobile's Upgrade to Premium (the upgrade
   sheet and Settings > Premium) asks the same `stripe-billing` function web
   does for a Stripe Checkout URL and opens it in the browser, or becomes the
   waitlist while `billing-availability` says checkout is closed
   (`packages/core/premiumCheckout.js`, `apps/mobile/lib/usePremiumCheckout.ts`).
   Entitlement stays in `billing_customers` / `is_premium()`, so no non-Stripe
   subscription store is needed.

   **Storefront gating.** Apple allows a link to external purchase without an
   entitlement only on the United States storefront (App Review Guidelines
   3.1.1(a), 3.1.3), so the control is drawn only when iOS reports the US
   storefront (`packages/core/purchaseLinkOut.js`, read through the local
   `apps/mobile/modules/plot-storefront` module). Any other storefront, an
   unknown one, or Android shows no control and no instruction to buy; a member
   who bought on the web still has Premium there. Other regions would need the
   StoreKit External Purchase Link Entitlement, which has not been applied for.
   What to say to App Review is in `docs/launch/app-review-notes.md`. Re-read the
   guidelines before each submission.
7. **Operational setup:** configure live prices, portal, webhook, support details
   and licence; obtain launch approval; enable server checkout and public pricing
   together. Re-add marketing sitemap/llms entries only at launch.

Schema work in items 2–4 must follow AGENTS.md: inspect live function bodies,
run migration restore and function-diff checks, then obtain approval before
production application. No production migration, production configuration or live payment was
performed by this branch. Sandbox payments and rollback-only staging proofs are
recorded separately from deployed readiness.

Reference: [Stripe webhook guidance](https://docs.stripe.com/webhooks) covers
retries, duplicates and non-guaranteed event order. Local checks do not substitute
for signed test-mode event delivery and browser checkout verification.
