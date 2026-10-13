# Plot Premium pilot purchase checklist

The first real purchase on the live Plot account. It proves checkout, the 7-day trial, the
webhook, entitlement, the portal and cancellation end to end before public launch. Run it
yourself with your own card. A trial is not charged, so if you cancel before day 7 the whole
pilot costs US$0 (your bank may show a temporary authorisation).

Written 2 October 2026. Production: Supabase `mkegtssedjyqldysvzga`, Stripe account
`acct_1TquJrIke4XlO34A`. Nothing here opens public checkout.

## 0. State before you start (already verified 2 October)

- [x] Two tax-inclusive USD prices on the live PLOT Premium product: US$3/month and US$24/year.
  Neither carries a trial; the trial comes from checkout. The three older active prices are archived.
- [x] `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY` point at those two prices.
- [x] `stripe-billing` is deployed with the 7-day trial for new subscribers (version 691). An
  unauthenticated checkout request returns 401.
- [x] Live portal `bpc_1UJCj1Ike4XlO34ASn26OsJA` lists only the two new prices.
- [x] Stripe business profile has the support URL and `support@theplot.tv`. Adaptive Pricing is on.
- [ ] `STRIPE_CHECKOUT_ENABLED` is `false`. Leave it. The pilot does not use it.

## 1. Before the purchase

- [ ] **Allowlist.** Your Supabase user ID is in `STRIPE_CHECKOUT_PILOT_USER_IDS`. Find your ID in
  the Supabase dashboard under Authentication, then check it against the secret (the digest
  matches only when the list holds exactly one ID):
  ```bash
  printf '<your-user-id>' | shasum -a 256
  supabase secrets list --project-ref mkegtssedjyqldysvzga | grep -A1 STRIPE_CHECKOUT_PILOT
  ```
  If it is not there, add it with `supabase secrets set STRIPE_CHECKOUT_PILOT_USER_IDS=<id>` (this
  replaces the list). Use a real account you can sign in to on `app.theplot.tv`. Do not use an
  account that already has a billing record.
- [ ] **Portal plan-change rule (decided 14 October: keep the trial).** In Settings, Billing,
  Customer portal, switch **off** "End trials on subscription updates". With it off, switching
  plan during the trial keeps the trial and the first charge stays on day 7 at the new price.
  Check the setting before step 6, then in the portal switch monthly to yearly and confirm the
  subscription is still Trialing with the same trial end and no payment was taken.
- [ ] **Note the portal's cancel setting** (Settings, Billing, Customer portal, Cancellations):
  "Cancel immediately" or "Cancel at end of billing period". It decides what step 4 looks like.
- [ ] Open the Stripe dashboard (live) on Developers, Webhooks, so you can watch deliveries.
  Confirm the endpoint lists `customer.subscription.trial_will_end`; add it if not.

## 2. Start checkout

The web Upgrade button does not call the server until #1161 is merged, so start it from the
signed-in app. On `app.theplot.tv`, signed in as the pilot account, open the browser console and run:

```js
const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
const { access_token } = JSON.parse(localStorage[key]);
const res = await fetch('https://mkegtssedjyqldysvzga.supabase.co/functions/v1/stripe-billing?action=checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
  body: JSON.stringify({ plan: 'monthly' }),
});
console.log(res.status, await res.json());
```

Expect `200` and a Stripe Checkout `url`. Open it. Expected responses otherwise: `503` with
`premium_coming_soon` means your ID is not on the allowlist; `503` "Billing price configuration
needs attention" means a secret points at a wrong price (check Section 0); `409` means a previous
attempt is still open, so wait a minute and retry.

## 3. On the Stripe checkout page (stop here if anything is wrong)

- [ ] Plan and price: US$3 per month, shown in your local currency with the conversion note
  (Adaptive Pricing). The total shows tax included.
- [ ] The 7-day free trial is shown and **today's charge is US$0**.
- [ ] The first charge date is 7 days from today.
- [ ] Merchant and support details look right (Plot, `support@theplot.tv`).
- [ ] Enter your card and confirm. Do not use a test card on the live account.

## 4. After you confirm

Within about 10 seconds:

- [ ] You land on `app.theplot.tv/settings?checkout=success`. Settings shows Premium and Manage
  subscription. If it says payment confirmation is pending, refresh once.
- [ ] Stripe, Subscriptions: one subscription, **Trialing**, trial ends in 7 days, price is the
  new monthly price, metadata `supabase_user_id` is your ID.
- [ ] Developers, Webhooks: `checkout.session.completed` delivered with `200`.
- [ ] Premium works: open the live release calendar link in Settings, open a smart list or
  Pick for Me, confirm no upgrade prompt appears.
- [ ] Analytics: PostHog shows `premium_checkout_started` and `premium_converted`. Note
  `premium_converted` fires when the trial starts, before any payment, so it counts trials.
- [ ] Email: on day 4 (3 days before the trial ends) you should get "Your plot Premium trial
  ends on ..." from billing@theplot.tv. It comes from `stripe-webhook` on
  `customer.subscription.trial_will_end`, so the live endpoint must subscribe to that event and
  `RESEND_API_KEY` must be set on production. Check Developers, Webhooks shows it delivered with
  `200` and that the email names the right date, US$3 a month and the Manage subscription
  link. Keep "Successful payments" receipts on (https://dashboard.stripe.com/settings/emails);
  after day 7 (or step 7) check the receipt.

## 5. Guard rails

- [ ] Run the step 2 snippet again. It must return a **portal** URL, not a second checkout.
- [ ] Run it signed in as any account that is not on the allowlist. It must return `503`
  `premium_coming_soon`.
- [ ] Without a token, `curl -X POST '.../stripe-billing?action=checkout'` returns `401`.

## 6. Portal and cancellation

- [ ] Settings, Manage subscription opens the Stripe portal with the monthly plan, the trial end
  date, your card and invoice history.
- [ ] Cancel the subscription in the portal.
  - If the portal cancels at period end: Premium stays until the trial ends (7 days), then the
    subscription ends with no charge. To see access removed now, cancel it immediately from the
    Stripe dashboard (Subscriptions, Cancel subscription, Immediately).
  - If it cancels immediately: Premium goes away within seconds.
- [ ] `customer.subscription.updated` or `deleted` delivered with `200`.
- [ ] After access ends: Settings no longer shows Premium, upgrade prompts return, and
  Manage subscription still opens the portal so invoices stay reachable.
- [ ] Your lists, notes and history are all still there (cancelling must not remove data).
- [ ] Stripe, Payments: **no payment was taken**. The invoice for the trial shows US$0.

## 7. Optional: prove the first real charge and a refund

Only if you want to test the paying path. In Stripe, open the trialing subscription and use
"End trial now" to bill immediately, confirm the US$3 invoice is paid and the webhook updates the
status to Active, then refund the payment in full from Payments and confirm the status you
expect. Stripe does not return its processing fees on refunds, so this costs a few cents.

## 8. Sign-off

Record the result (date, plan, pass or fail per section, anything odd) in
`docs/billing/stripe-test-verification.md`. If every box above passes, the remaining launch
steps are in `docs/billing/stripe-launch.md`. To stop a pilot at any point, remove the ID from
`STRIPE_CHECKOUT_PILOT_USER_IDS` and cancel the subscription.

## Known gaps this pilot does not cover

- The web Upgrade button and the launch copy (#1161) and the public switch (#1162) are tested
  separately; this checklist starts checkout from the console on purpose.
- The Stripe webhook endpoint uses API version 2026-06-24.dahlia; the sandbox tests used
  2026-08-26.dahlia. Step 4 is the first live check of that difference.
- Overseas tax collection is not covered (see `docs/billing/production-preparation.md`).
