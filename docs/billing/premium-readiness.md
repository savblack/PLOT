# PLOT Premium readiness

Reviewed 16 September 2026. This is a build assessment, not evidence of a live payment test.

## Product decision

Keep the recorded US$3/month or US$25/year price (31% annual saving). Keep tracking,
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

| Product | Paid offer | Implication for PLOT |
| --- | --- | --- |
| [Letterboxd](https://letterboxd.com/pro/) | Pro $19/year: statistics, streaming filters/alerts, no ads. Patron $49/year adds custom artwork and presentation. Unlimited lists are free. | A list limit alone is not a compelling differentiator. Journal presentation fits PLOT better than charging for basic tracking. |
| [SIMKL](https://simkl.com/vip/) | Pro $34.99/year. VIP $34.99 every six months adds reviews of viewing periods, calendar sync, backup and exports. Lifetime $249. | Calendar sync is an established paid convenience. Keep PLOT data export free as already promised. |
| [Trakt May 2026 product update](https://forums.trakt.tv/t/trakt-product-update-may-2026/111812) | Official direction: useful free tracking and casual Plex sync; VIP for heavier use, multiple servers, near-real-time sync and deeper control. | Basic sync is becoming less distinctive. Current checkout price could not be verified; do not reuse the old US$60 figure as a fresh quote. |

## Existing implementation and changes in this branch

- Stripe Checkout, customer portal, signed webhook, database entitlements and
  calendar feed already exist. Public pricing and media-sync flags remain disabled.
- Correct shared/web prices to US$3/US$25; marketing already had those amounts.
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
2. **Checkout concurrency:** persist a stable Stripe customer before checkout and
   reuse an open session. Current checks only catch an already-mapped active
   subscription; simultaneous first purchases can still create two subscriptions.
3. **Webhook durability:** the staging migration and handler now atomically commit
   subscription, badge and receipt with an account lock. Staging rollback tests
   prove failure recovery, duplicate and older-event behaviour. Production rollout
   and concurrent/equal-timestamp delivery checks remain. See
   [test evidence](stripe-test-verification.md#subscription-and-access-follow-up-2026-09-23).
4. **Entitlement consistency:** web now reads the authoritative entitlement and
   retains billing management after expiry. The new badge write uses the database
   grace policy. Staging backend rollout is complete; actual signed payment activation is pending;
   native wiring remains deferred.
5. **Lifecycle proof in Stripe test mode:** purchase both plans; delayed activation;
   decline; renewal; failed renewal and recovery; cancel at period end; resume;
   plan switch; expiry; portal access after loss of entitlement. Prove list data
   survives downgrade and the calendar feed stops granting expired access.
6. **Native payments:** resolve the iOS/Android purchase approach and entitlement
   parity before showing native upgrade actions. The historical instruction to
   link iOS users to the website is not a universal approval. Review current
   [Apple guidelines](https://developer.apple.com/app-store/review/guidelines/)
   (3.1.1 and 3.1.3) for each storefront. Native implementation is not changed here.
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
