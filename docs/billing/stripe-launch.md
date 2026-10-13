# Plot Premium launch checklist

Current release decision (26 September 2026): US$3/month or US$24/year,
tax-inclusive Managed Payments with Adaptive Pricing and AUD settlement.
The launch package adds a 7-day free trial. The trial is requested by the
`stripe-billing` checkout (`PREMIUM_TRIAL_DAYS` in `_shared/billingPolicy.ts`),
not set on the Price, so any tax-inclusive US$3/US$24 Price gets it and a Price
made without trial days cannot charge early. Only new subscribers get it;
an account with a cancelled subscription pays from the start. The first charge
is 7 days after the trial starts. Cancel during the trial and the charge is $0.
Supabase secrets `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY` point at
tax-inclusive prices outside this repo. Stripe cannot change tax behavior after a
Price is created, so a Price created as exclusive must be replaced. Do not copy the
price IDs into tracked files.
Bangladesh is accepted with owner-managed registration, filing and remittance;
configuration is deferred by the owner until the first sale, not verified or
completed. No Radar purchase or Bangladesh exclusion. Historical audit entries
below must not override this decision. Public checkout remains closed pending
explicit launch approval. See selective-tax-routing.md for the latest tests.

Server-only configuration: STRIPE_CHECKOUT_ENABLED=false, STRIPE_SECRET_KEY,
STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY, STRIPE_WEBHOOK_SECRET,
STRIPE_PORTAL_CONFIGURATION and STRIPE_SETTINGS_URL. Store secret values only
in the environment secret store. The Managed Payments implementation requires
explicit inclusive price behavior; the old inferred default alone is insufficient.


Plot Premium is US$3 monthly or US$24 yearly. The web app uses Stripe Checkout
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
and 2400 cents. Do not add manual `currency_options` for converted currencies.
Tax registration and collection remain a separate launch prerequisite.

USD settlement is enabled in the Plot sandbox, alongside default AUD. Direct AUD
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

## Before going live (reconcile historical setup against the current decision above)

1. TMDB clearance is confirmed by Savannah. Complete the test-mode lifecycle
   and engineering gates in the readiness document. After launch approval, in Stripe **live mode**, create a Plot Premium product with two recurring
   USD prices: US$3/month and US$24/year. Record the two live price IDs.
2. Set the Stripe account's public business URL and support email. The Customer
   Portal should also show the Plot terms and privacy URLs. In Settings, Billing,
   Subscriptions and emails, turn on the customer email for trials that are about to
   end. Stripe sends it before the trial converts (and fires
   `customer.subscription.trial_will_end`), which is the notice the Terms promise and
   that US and Australian consumer rules expect before a free trial becomes a charge.
   Keep successful-payment emails on too, so each charge produces a receipt.
3. In the live-mode Customer Portal, enable cancellation, payment-method
   updates, invoice history, and price switching. Its catalogue must contain
   only the Plot Premium product and both live prices. Schedule shorter-interval changes for
   the end of the current period. The tested sandbox configuration resets the
   billing anchor to now and uses `always_invoice` for immediate prorated upgrades.
   Verify the invoice preview before copying this configuration into live mode.
   **Decision (14 October 2026): a plan switch during the trial keeps the trial.** In the
   live portal configuration, switch off "End trials on subscription updates" so that
   moving between monthly and yearly in the first 7 days does not bill immediately; the
   first charge stays on the day the trial ends, at the newly chosen price. The Terms
   state this, so verify it in the pilot before opening checkout.
4. Create or update the live webhook at
   `https://mkegtssedjyqldysvzga.supabase.co/functions/v1/stripe-webhook`.
   Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.expired`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`, `invoice.payment_succeeded`, and `invoice.paid`.
   The handler verifies `Stripe-Signature` and writes `stripe_events` in the
   same transaction as `billing_customers`. Invoice events refetch the
   subscription. Do not point this endpoint at a test-mode secret.
5. Set these Supabase Edge Function secrets from the live Stripe dashboard:
   `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, and
   `STRIPE_WEBHOOK_SECRET`. `STRIPE_PRICE_YEARLY` must be the active
   tax-inclusive USD price at 2400 cents. A 2500-cent price is rejected.
6. Keep `STRIPE_CHECKOUT_ENABLED=false` until launch approval. Checkout validates
   that the selected price is an active USD recurring price for exactly US$3/month and
   US$24/year. Verify Adaptive Pricing is enabled in the intended live Plot
   account before launch; use USD as the fallback. Confirm local-currency monthly
   and yearly checkout, renewal, plan switching and refund behavior in sandbox.
7. Deploy `stripe-billing` and `stripe-webhook`. Keep public pricing flags closed
   and `STRIPE_CHECKOUT_ENABLED=false`. Use the private pilot allowlist below
   for an explicitly approved low-value purchase. Confirm checkout, cancellation,
   webhook processing, refund and loss of Premium access.
8. Public launch is the single secret `STRIPE_CHECKOUT_ENABLED=true`, after the
   deployed `stripe-billing` includes the server gate (`publicCheckoutOpen` in
   `_shared/billingPolicy.ts`) and the web checkout controls are live. Only the exact
   value `true` opens checkout; anything else, including `TRUE`, `1` or a typo, leaves
   it closed. Verify the deployed behavior before announcing launch. To close it again,
   set the secret back to `false`; the pilot allowlist keeps working.

## Confirm the switch without reading the secret

Do this on the project you are about to open (staging first, production only
when that launch is approved). Do not paste secret values into chat or into
the repo.

1. Deploy `billing-availability`, `stripe-billing`, and `stripe-webhook`.
   Leave `STRIPE_CHECKOUT_ENABLED` unset or set to `false`.
2. In the `stripe-billing` or `billing-availability` logs, confirm one line:
   `checkout enabled=no pilotCount=0` (or the pilot count you intended).
   The line does not include user ids or price ids.
3. Or call the operator endpoint with the service-role bearer (the gateway
   verifies it; a user JWT is rejected):

   `POST https://<project>.supabase.co/functions/v1/stripe-billing?action=status`

   Expect `{ "checkoutEnabled": false, "pilotCount": 0 }`.
4. Signed out, the plans page calls `billing-availability` and shows
   "Join the waitlist" while `checkoutEnabled` is false. It must not show
   "We couldn’t start checkout."
5. After the live prices, webhook, and portal are in place, set
   `STRIPE_CHECKOUT_ENABLED=true`. Repeat steps 2 and 3 and expect
   `checkout enabled=yes`. A signed-in free account on `/plans` should then
   see "Upgrade to Premium", and Checkout should open. A pilot-only check
   is `STRIPE_CHECKOUT_PILOT_USER_IDS` set to that account's auth user id,
   with the public switch still false. `pilotCount` goes up by one. The
   id itself is not returned.

This repository change does not set the production secret, does not create
live prices, and does not send a live webhook.

Never put Stripe secret keys or price IDs in browser variables or tracked files.

## Staging lifecycle rollout prerequisites

Apply `20260923100000_atomic_stripe_subscription.sql` before deploying the updated
webhook. Its two RPCs replace multi-request billing writes and expose self-only
billing management after expiry. The export CORS fix also requires a staging
`export-user-data` deployment. The migration and all three functions were deployed to PLOT Staging with approval on 2026-09-24. Production remains unchanged.

Set `STRIPE_SETTINGS_URL` to the staging/QA Settings page and
`STRIPE_PORTAL_CONFIGURATION` to the tested Plot sandbox configuration. Keep
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

## Private live checkout pilot

Public checkout remains closed in the server and client. The server-only
`STRIPE_CHECKOUT_PILOT_USER_IDS` setting permits exact Supabase Auth user IDs
(comma separated) to call the existing checkout endpoint. It checks the verified
Auth identity before reading billing records or making Stripe calls. Do not put
emails, client-supplied IDs, or this setting into frontend configuration.

Keep `STRIPE_CHECKOUT_ENABLED=false` until launch. The pilot does not use that
global switch: the allowlist works whether it is on or off, and with the switch off
and no allowlist checkout is closed. Remove the pilot setting to close new pilot
sessions; existing Stripe sessions must be expired separately. Portal access and
existing subscriptions are unaffected.

Use an authenticated pilot session to request checkout. Stop before payment
unless the real charge has been explicitly approved. Verify another account is
rejected and retain webhook/entitlement proof before opening public checkout.
