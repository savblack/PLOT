# PLOT Premium launch checklist

PLOT Premium is US$3 monthly or US$25 yearly. The web app uses Stripe Checkout
for purchase and the Stripe Customer Portal for cancellation, payment-method
updates, and switching between those two plans.

Pricing decision (2026-09-24): retain those USD base prices and use Stripe
Adaptive Pricing to offer supported local currencies elsewhere. Unsupported
sessions/currencies fall back to USD. This is exchange-rate conversion, not
fixed country-specific prices or purchasing-power pricing. Stripe's quoted
local-currency amount includes its conversion fee (currently 2–4% paid by the
customer); do not promise a fixed AUD/GBP/EUR amount.

Hosted Checkout inherits the Dashboard Adaptive Pricing setting; the handler
does not override it. Keep validating the underlying USD Price objects at 300
and 2500 cents. Do not add manual `currency_options` for converted currencies.
Tax registration and collection remain a separate launch prerequisite.

USD settlement is enabled in the PLOT sandbox, alongside default AUD. Direct AUD
monthly and GBP annual checkout, GBP monthly and annual renewals, both portal
plan-change directions and a full GBP refund have passed with the approved USD
base prices. See the verification log for exact evidence and coverage limits.
Production settlement and bank settings have not been inspected or changed.
Stripe's public Australian multi-currency settlement pricing lists 1%, while
the sandbox displays 0.91%; confirm the live account's applicable merchant fee
before enabling USD settlement. This is separate from the customer FX markup.

Source: [Stripe Adaptive Pricing](https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing?payment-ui=stripe-hosted).

See [Premium readiness](premium-readiness.md) for the competitor review and unresolved
engineering gates. This checklist alone does not establish launch readiness.

## Bangladesh decision (26 September 2026)

Bangladesh is accepted, not excluded. Savannah will handle VAT registration,
filing and remittance. See the current decision in
[the tax verification log](selective-tax-routing.md#current-bangladesh-decision-26-september-2026).
The exclusion is no longer a launch requirement. Actual tax configuration and
checkout/renewal verification remain distinct from accepting that responsibility.
This decision does not enable public checkout or authorize a production change.

## Before going live

1. TMDB clearance is confirmed by Savannah. Complete the test-mode lifecycle
   and engineering gates in the readiness document. After launch approval, in Stripe **live mode**, create a PLOT Premium product with two recurring
   USD prices: US$3/month and US$25/year. Record the two live price IDs.
2. Set the Stripe account's public business URL and support email. The Customer
   Portal should also show the PLOT terms and privacy URLs.
3. In the live-mode Customer Portal, enable cancellation, payment-method
   updates, invoice history, and price switching. Its catalogue must contain
   only the PLOT Premium product and both live prices. Schedule shorter-interval changes for
   the end of the current period. The tested sandbox configuration resets the
   billing anchor to now and uses `always_invoice` for immediate prorated upgrades.
   Verify the invoice preview before copying this configuration into live mode.
4. Create a live webhook at
   `https://mkegtssedjyqldysvzga.supabase.co/functions/v1/stripe-webhook`.
   Subscribe to `checkout.session.completed`, `customer.subscription.updated`,
   and `customer.subscription.deleted`.
5. Set these Supabase Edge Function secrets from the live Stripe dashboard:
   `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, and
   `STRIPE_WEBHOOK_SECRET`.
6. Keep `STRIPE_CHECKOUT_ENABLED=false` until launch approval. Checkout validates
   that the selected price is an active USD recurring price for exactly US$3/month and
   US$25/year. Verify Adaptive Pricing is enabled in the intended live PLOT
   account before launch; use USD as the fallback. Confirm local-currency monthly
   and yearly checkout, renewal, plan switching and refund behavior in sandbox.
7. Deploy `stripe-billing` and `stripe-webhook`, enable `STRIPE_CHECKOUT_ENABLED=true` together with the public pricing flags,
   then, with explicit approval, make one real low-value
   purchase and confirm checkout, portal cancellation, webhook processing, and
   loss of Premium access after the paid period ends.

Never put Stripe secret keys or price IDs in browser variables or tracked files.

## Staging lifecycle rollout prerequisites

Apply `20260923100000_atomic_stripe_subscription.sql` before deploying the updated
webhook. Its two RPCs replace multi-request billing writes and expose self-only
billing management after expiry. The export CORS fix also requires a staging
`export-user-data` deployment. The migration and all three functions were deployed to PLOT Staging with approval on 2026-09-24. Production remains unchanged.

Set `STRIPE_SETTINGS_URL` to the staging/QA Settings page and
`STRIPE_PORTAL_CONFIGURATION` to the tested PLOT sandbox configuration. Keep
sandbox keys and price IDs separate from production. A local QA return URL is
only valid while that preview is running. See `stripe-test-verification.md` for
completed sandbox purchases and the remaining signed-delivery/renewal checks.

The checkout handler also requires `20260924020000_checkout_attempts.sql` and
Customers **write** permission on its restricted Stripe key. The migration and
handler were deployed to staging on 2026-09-24. The key permission was saved and
the deployed concurrency/plan-change pilot passed. Checkout was closed afterward.

The real failed-renewal pilot exposed a grace-period defect: Stripe advances the
period end even when renewal payment fails. Migration
`20260924030000_billing_grace_start.sql` adds a durable first-failure timestamp so
retries cannot extend three-day grace. With approval, it was applied to staging
on 2026-09-24 after production-restore and function-diff checks. Grace, billing
lifecycle and checkout access proofs passed against the deployed schema.
Webhook ordering hardening in `20260924040000_billing_snapshot_guard.sql` and
the updated webhook handler was deployed to staging with approval on 2026-09-24.
Deployed SQL proofs and signed sandbox cancellation/reversal delivery passed.
The planned local-currency sandbox lifecycle tests passed on 2026-09-24.
Old sandbox-key rotation, tax verification and the separately approved production
configuration and rollout remain before launch sign-off.
