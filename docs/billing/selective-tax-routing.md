# Selective tax routing research

Reviewed 25 September 2026. Research and proposed policy only; no live configuration
or checkout behaviour changed. Assumes an Australian sole trader selling automated
consumer software directly, with no foreign establishment, existing foreign tax
registration, or other relevant business turnover. Thresholds require ongoing
monitoring and forecasts, not a permanent country exemption.

## Current Bangladesh decision, 26 September 2026

Savannah explicitly accepts Bangladesh consumer subscriptions and will handle
VAT registration from the first consumer transaction, filing and remittance.
This supersedes the earlier exclusion requests and unresolved policy notes below.
Do not implement a Bangladesh block or purchase Radar for this purpose.

Keep the approved USD3/month and USD24/year tax-inclusive prices. Acceptance of
merchant tax responsibility is not evidence that registration is complete or
that Stripe is collecting Bangladesh VAT. The earlier sandbox payment calculated
zero tax; retain that result as evidence of the configuration still needing work.
Before claiming automatic collection is ready, configure the genuine registration
when available and verify inclusive VAT on Bangladesh checkout and renewal in
the sandbox. Do not represent a Stripe Tax registration setting as government
registration, or a reserve as tax paid. Owner-managed filing/remittance remains
outside the app. No registration, live tax setting or checkout activation was
performed by recording this decision. Public launch still requires approval.

## Initial standard-Stripe candidates

- AU: below compulsory GST registration under current/projected GST turnover rules
  (A$75,000). Monitor the entire relevant sole-trader business, not only AU customers.
  https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst
- NZ: remote-service rules use NZ$60,000 relevant NZ supplies in the preceding or
  expected next 12 months. Obtain two non-conflicting location evidence items.
  https://www.ird.govt.nz/gst-on-remote-services
- SG: overseas vendor registration requires both global annual turnover above
  S$1m and relevant Singapore B2C supplies above S$100,000. Retrospective and
  prospective tests apply.
  https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-and-digital-economy/overseas-businesses
- HK: no general sales tax or VAT. This is not an exemption from income tax.
  https://www.investhk.gov.hk/en/setting-hong-kong/tax-basics/
- CH: relevant worldwide turnover threshold CHF100,000, not Swiss revenue only;
  foreign B2C electronic services can trigger liability when that threshold is met.
  https://www.estv.admin.ch/en/vat-liability-foreign-companies
  https://www.estv.admin.ch/en/questions-answers-vat

## Managed / unresolved markets

UK and EU consumer digital sales: use Managed Payments, subject to account,
product and territory coverage. Do not apply domestic small-business thresholds
for an Australian supplier.
https://www.gov.uk/guidance/the-vat-rules-if-you-supply-digital-services-to-private-consumers
https://vat-one-stop-shop.ec.europa.eu/one-stop-shop_en

Canada: do not approve a nationwide standard route using federal GST/HST threshold
alone. Provincial rules require separate review; Saskatchewan explicitly includes
resident and non-resident SaaS providers.
https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/digital-economy-gsthst/find-out-need-register.html
https://www2.gov.bc.ca/gov/content/taxes/sales-taxes/pst/publications/software
https://sets.saskatchewan.ca/rptp/wcm/connect/a1169319-a762-4328-b84c-88d844e8f340/PST.007%2BComputer%2BHardware%2C%2BSoftware%2B%26%2BComputer%2BServices.pdf?MOD=AJPERES

US: thresholds and SaaS taxability require state/local review; this research is
not a 50-state clearance. Candidate for later standard routing after rules and
monitoring are implemented. Use Managed Payments initially where supported.
https://www.streamlinedsalestax.org/for-businesses/remote-seller-faqs/remote-seller-state-guidance

Norway and Japan: threshold regimes identified but not cleared for initial routing;
complete the foreign-provider-specific rules before expanding the allowlist.
Other markets: not exhaustively reviewed. Default to eligible Managed Payments;
unsupported/unresolved destinations must not silently fall back to standard Stripe.

## Implementation requirements before launch

1. Verify account/product eligibility and covered destinations. Select the actual
   software tax category; Plot is not a video-streaming service.
2. Reliable billing-country evidence before session creation; locale, display
   currency and profile region alone are insufficient. Validate address changes
   before payment, not merely after a completed charge.
3. Persist chosen billing route with checkout attempt/idempotency identity. Existing
   retry logic reuses by price alone and cannot safely support a changing route.
4. Record relevant revenues in threshold currency, time windows and forward-looking
   assessments; alerts are an operational aid, not automatic legal registration.
5. Handle renewals, moves and threshold crossings. Stripe explicitly says existing
   standard subscriptions cannot simply be enabled for Managed Payments. Existing
   subscriptions need a separately tested compliance/transition plan.
6. Test in sandbox: country evidence mismatch, retry, changed country, unsupported
   destination, inclusive tax, recurring charges, refunds and account isolation.
7. Keep public checkout closed until separately approved rollout.

https://stripe.com/managed-payments
https://docs.stripe.com/payments/managed-payments/update-checkout

The proposed starting list is AU/NZ/SG/HK/CH, conditional on the assumptions above.
This is a bounded launch recommendation, not a complete world tax survey or legal
clearance. No customer data, live account settings, code or deployments changed.

## User approval and setup inspection, 25 September 2026

User approved standard Stripe for AU/NZ/SG/HK/CH under the researched conditions,
and Managed Payments for other supported destinations. This replaces the pending
policy decision above; it does not mean routing is deployed or checkout is open.

Live account Managed Payments onboarding displayed "all your products are eligible".
Selected prebuilt Checkout and existing integration, stopping at the code/test
step before Finish setup. No terms accepted, payment created or launch flag changed.
Dashboard onboarding progress was saved.

API inspection (PostCheckoutSessions, 2026-08-26.preview) confirms
managed_payments.enabled is per session; billing_address_collection accepts only
auto/required. The exposed allowed_countries field is for shipping addresses, not
billing addresses. Do not implement this as a user-selected profile-country switch
or claim that the final Checkout billing country is locked. The pre-payment
country enforcement mechanism remains unresolved, alongside threshold monitoring
and an existing-subscription transition plan. No checkout code was changed.

## Dedicated sandbox API verification, 25 September 2026

Tested only account `acct_1TquK0Erc2irccea` (livemode false), not the live
account or its shared test mode. The first Managed Payments session request failed
because the QA product had no tax code. Updated sandbox product
`prod_VJPhoX1JOplXs6` to the API-listed personal-use SaaS category
`txcd_10103000`; the retry succeeded.

Monthly session `cs_test_a1MHyld6locNStRoT0Wfit7Pkdkep078mQ8tRTMONytXTf7NvsHqKdpD3S`
returned Managed Payments enabled, Adaptive Pricing enabled and automatic tax
liability assigned to Stripe. It remained open/unpaid, with tax status
`requires_location_inputs`. This verifies session creation, not a completed payment,
country enforcement, final tax calculation or renewal.

Created a separate sandbox annual price `price_1UJTPLErc2ircceayLk9vrt4`, USD
2400/year, explicitly tax inclusive. The old USD25 QA price remains for historical
lifecycle tests. This new price is not yet wired into staging configuration.
Live prices, live tax settings and checkout launch flags were not changed.

Outstanding: obtain a documented pre-payment country enforcement approach and
existing-subscription country/threshold transition behavior. A support-contact
permission question was presented to the owner; no support message has been sent.
Do not deploy a profile-country-only router as if these checks were complete.

## No-Radar investigation, 25 September 2026

Owner explicitly declined Radar. Do not enable it or make it a launch dependency.

Stripe documents server-side pre-payment validation using ConfirmationTokens in
its web subscription flow:
https://docs.stripe.com/payments/finalize-payments-on-the-server?platform=web&type=subscription
The token can be sent to the backend for additional validation/business logic
before confirming payment. This is a candidate for enforcing the standard-route
country allowlist without Radar. It uses Elements and subscription/payment APIs,
not the current hosted Checkout integration. It is not a verified drop-in patch.

Managed Payments documentation describes hosted/embedded Checkout Sessions, not
this custom subscription flow. Do not infer that ConfirmationTokens can enable
Managed Payments, or that an embedded iframe provides a billing-country approval
callback. The server-only Checkout permissions documentation found applies to
shipping details, which Managed Payments does not collect:
https://docs.stripe.com/changelog/basil/2025-03-31/cs_add_checkout_session_permissions
https://docs.stripe.com/payments/managed-payments/update-checkout

A split integration (standard Elements with server validation; Managed hosted
Checkout) is technically worth prototyping, but does not by itself solve changes
to an unsupported country inside Managed Checkout. Nor does initial confirmation
validation govern later off-session renewals. Still unverified: Managed country
coverage enforcement without Radar, country-change handling before renewals,
and Adaptive Pricing parity on the custom standard flow. A country selector or
client-side callback alone must not be represented as server enforcement.

This investigation changed documentation only. No new billing implementation,
paid feature, live configuration or deployment was applied. No build was run
because application code was not modified.

## Superseding launch decision and implementation, 25 September 2026

Owner approved Managed Payments for all new subscriptions, including Australia,
with no additional Radar purchase. The earlier five-country split is deferred.
USD3/month and USD24/year remain tax inclusive. Checkout remains closed.

Local checkout implementation now stores a managed_payments boolean on each
attempt, preserving the exact legacy parameters when recovering an uncertain
standard session. A legacy session is never returned to the customer by the new
code; a subsequent retry expires it before creating a managed replacement.
New attempts enable Managed Payments; Stripe enables Adaptive Pricing and tax.
The price policy now requires explicit inclusive tax behavior, so the existing
unspecified live prices require configuration before this code can serve checkout.
Stripe SDK for checkout/billing updated to 22.6.0. No production changes applied.

Deployment order: keep checkout closed; apply the additive migration; deploy the
matching function before reopening. The migration changes the new-attempt default,
so do not open checkout with the old function after applying it. No function body,
RLS policy or existing user history is modified by this migration.

Verification:
- npm run check: passed (existing lint warnings, no errors; web build succeeded).
- DENO_DIR=/tmp/plot-tax-billing-deno npm run edge:check: 23 functions passed,
  34 shared tests passed, edge lint clean.
- Dedicated sandbox session cs_test_b148D0SwvSCT6GotxaQU9DSLuen0svCXFhHc0ulYnDXHfJ2vCxPQtHr8o3:
  annual USD2400, managed=true, adaptive=true, automatic tax liability=stripe.
  Open/unpaid; requires_location_inputs. This is session-creation evidence only.
- npm run db:migration-test: blocked before restore because the main checkout
  lacks PLOT_PRODUCTION_DB_PASSWORD / SUPABASE_DB_URL. Do not merge or deploy the
  new migration until restore and staging verification pass.

Remaining launch gates: migration validation and staging application; explicit
inclusive prices in each environment; full managed checkout/payment/refund/renewal
and customer-management testing; unsupported tax-destination policy; live setup
completion and explicit public launch approval. All-managed routing removes the
hybrid switch, but does not expand Stripe's tax coverage to all accepted countries.

## Restore and staging deployment verification, 25 September 2026

Correction to the earlier credential blocker: credentials were already present in
.env; the command had not exported them. After loading the existing environment,
PostgreSQL initialization required execution outside the sandbox because shmget
was denied. The authorized rerun succeeded: all seven pending migrations applied
to a disposable production copy, which was torn down afterward. Production was
read-only. Vault/pg_net remain stubbed and this restore does not exercise RLS.

Added scripts/staging-managed-checkout-test.sql. Its transaction rolls back and
uses only a synthetic pilot account. It passed both before and after deployment:
legacy false mode preserved, new default true, RPC returns mode, client access
denied. Staging checkout was closed before applying migration 20260925120000
(with migration history recorded) and deploying stripe-billing to
uzrhfivnhdcfieuaxzip. The signed-in staging checkout probe returned HTTP503.

Sandbox monthly price price_1UImw9Erc2irccea4KZMlYAo is now explicitly inclusive.
Staging configured monthly USD300 and annual USD2400 price
price_1UJTPLErc2ircceayLk9vrt4. Live prices and production deployment unchanged.

Browser payment verification blocked: Chrome reported another extension UI open.
Owner asked to dismiss it. No managed payment or renewal is claimed as tested.
Unsupported tax destinations remain unresolved; the all-managed choice is not a
worldwide tax guarantee. Keep public checkout closed pending a supported exclusion
mechanism or a separately reviewed compliance policy for uncovered jurisdictions.

## First completed Managed Payments sandbox purchase, 25 September 2026

Resetting the browser control session cleared the repeated extension-popup error.
Completed the existing annual probe checkout with Stripe test card 4242 and a
synthetic customer, with optional Link information saving disabled. No real card
or funds used. Checkout cs_test_b148D0SwvSCT6GotxaQU9DSLuen0svCXFhHc0ulYnDXHfJ2vCxPQtHr8o3
is complete/paid. Subscription sub_1UJWzRErc2ircceahx1md0gA is active, livemode
false, USD2400/year, explicitly inclusive. Initial invoice
in_1UJWzPErc2ircceacnFJubHt. Session tax US218 cents, automatic tax complete with
liability=stripe. Browser displayed localized AUD35.52 with GST3.23 included;
Stripe's subscription and session accounting amounts are USD.

This was the connector-created product probe, not the signed-in Plot checkout:
it does not prove Plot entitlement fulfillment. At purchase time its customer had no test clock. The follow-up below attaches
one to the existing synthetic customer and verifies renewal.
Public checkout remains closed; refund, renewal, account entitlement and
unsupported-country launch gates remain outstanding.


## Managed refund, renewal and staging entitlement proof, 25 September 2026

Dedicated sandbox acct_1TquK0Erc2irccea only; all payments synthetic.

- Full refund sandbox-refund-reference-retained-in-Stripe succeeded for the original annual
  payment: USD2400, localized presentment AUD3552. Subscription remained active;
  refunding a payment does not itself cancel recurring billing.
- Attached clock_1UJXUBErc2ircceaaoyJzVe6 to the existing synthetic customer.
  Advanced one year, then one day for invoice finalization. Renewal invoice
  in_1UJXWKErc2irccea6zlhuMFc is paid, billing_reason subscription_cycle,
  USD2400 with inclusive tax218 and automatic_tax liability stripe. Subscription
  period end advanced to 1853492906 (2028).
- Ran node .playwright/import-pilot/managed-checkout-live.mjs against staging.
  Four concurrent requests returned 200/409/409/409. Retry reused the same
  session, managed_payments was true in the persisted attempt, and the lease
  was released. The finally block closed staging checkout; a subsequent request
  returned HTTP503.
- Paid monthly session
  cs_test_b1ThZJGbcLRpD1kFAuJ61wGoH7XgAz9meKdzsE0EJl0vOPHzpLn8xfayqu
  through the actual staging endpoint. Stripe confirms complete/paid,
  managed_payments enabled and adaptive_pricing enabled. Browser showed AUD4.44
  per month with GST0.40 included; base USD300, tax27.
  Subscription sub_1UJXYrErc2ircceaWLcIwIRB.
- node .playwright/import-pilot/managed-billing-api.cjs confirmed signed-in
  get_my_billing_status reports active, isPremium true, canManage true,
  periodEnd 2026-10-25T11:45:02+00:00. No manual entitlement writes were used.
  The portal action returned HTTP200 and a test billing portal URL.

Browser extension UI blocked the final return-page inspection. Portal creation
is proven, but portal UI/cancellation/update behavior is not yet verified for
Managed Payments. Monthly managed renewal and failed-payment recovery also
remain untested. Unsupported tax-destination handling remains a launch gate.
Production and public checkout were not changed or enabled.

## Monthly lifecycle and portal pricing follow-up, 25 September 2026

- Found the sandbox customer portal still offered USD25/year. Updated only
  bpc_1UIpVVErc2ircceam3Dwv9WG to offer the inclusive USD3 monthly and USD24
  yearly prices, with quantity adjustment disabled. Browser confirmed USD24/year.
  Production portal configuration has not been changed; verify it before launch.
- Attached clock_1UJXnjErc2ircceaCcINpARt to synthetic customer
  cus_VKBuCBvHziJalk, then advanced to 26 October 2026. Renewal invoice
  in_1UJXseErc2irccea4FOjDsBC paid USD300, including tax27. Plot's signed-in
  billing RPC reported active/Premium and period end 2026-11-25T11:45:02Z.
- Set cancel_at_period_end true through the sandbox subscription API. Actual
  webhook delivery changed Plot's cancelAtPeriodEnd to true while preserving
  Premium through the paid period. Reversed the scheduled cancellation for
  further testing; Stripe confirmed false. This proves API/webhook behavior,
  not the final customer-portal cancellation click or access expiry.
- Customer portal displayed subscription, AUD charging, paid invoice, cancellation
  and payment-update controls. Chrome extension interruption prevented completing
  the decline-on-charge card update. Failed renewal/recovery on this Managed
  Payments fixture remains unverified. Earlier standard-billing tests do not
  replace that evidence. Public checkout remains closed.

Verification commands: node .playwright/import-pilot/managed-billing-api.cjs
(repeated for real signed-in state); git diff --check (passed). No application
code changed in this follow-up, so lint/build were not rerun.

## Completed remaining lifecycle tests and country failure, 25 September 2026

All activity below used dedicated sandbox acct_1TquK0Erc2irccea and synthetic
staging customer cus_VKBuCBvHziJalk. No production settings or real payments changed.

### Passed

- Added Stripe's decline-on-charge test card ending 0341 through the customer
  portal. Selected it for sub_1UJXYrErc2ircceaWLcIwIRB through the portal's
  subscription payment selector. Managed Payments rejects changing
  default_payment_method through the subscription API; the supported customer
  portal update succeeded. Adding a customer-default card alone does not change
  the subscription-specific selection.
- Advanced clock_1UJXnjErc2ircceaCcINpARt to 26 November. Invoice
  in_1UJYBJErc2ircceaHFBxC0Fg was open, USD300 due, zero paid, one attempt.
  Both Stripe and Plot reported past_due. The portal showed Payment failed and
  an actionable payment-method update link.
- Used that link to select the original working 4242 card. The portal paid the
  invoice (USD300, AUD444 presentment); Plot's actual signed-in RPC returned
  active/Premium through 2026-12-25. No manual entitlement writes.
- Canceled using the portal confirmation. Plot retained Premium with
  cancelAtPeriodEnd true. Advanced the clock to 26 December: Stripe canceled
  the subscription and Plot returned canceled/isPremium false/canManage true.
- Resubscription through the real staging endpoint created a new managed session.
  Concurrent requests returned 409/409/200/409; retry reused one session and
  released its lease. Checkout was closed in finally and verified HTTP503.
  Completing it restored Premium on the same Plot account and Stripe customer.

### Failed launch gate: unsupported tax country

The resubscription also tested billing country Bangladesh (BD), which is absent
from Stripe's Managed Payments tax-coverage list. Checkout accepted the test
payment with no country restriction:

- Session cs_test_b1ICi3YhjlRPJpL32ISVBPmeoRnqBo6seTcjUQVM909mTHCJDuLkUb8weA:
  complete/paid, customer country BD, tax0, automatic_tax liability type self.
- Subscription sub_1UJYGCErc2ircceaG10tGTBv and invoice
  in_1UJYGBErc2irccea5UllwbRk; payment pi_3UJYGBErc2irccea1N63kn6A.
- Plot granted Premium. Therefore all-managed mode does not enforce tax-covered
  destinations. This is a failed launch requirement, not a passed negative test.
- Refunded all USD300 (sandbox-refund-reference-retained-in-Stripe, succeeded) and canceled
  that synthetic subscription without proration or another invoice. Plot again
  confirmed canceled/isPremium false. Test account left canceled.

Official coverage source rechecked:
https://docs.stripe.com/payments/managed-payments/tax-compliance
It expressly assigns unsupported-country indirect-tax compliance to the merchant.
Do not enable public checkout until a supported exclusion mechanism or a reviewed
compliance approach resolves this. No Radar purchase or support contact was made.

### Regression verification

- npm run check: passed lint/build; existing warnings only.
- npm run test:unit: 304 web + 644 core tests passed (948 total).
- DENO_DIR=/tmp/plot-tax-billing-deno npm run edge:check: 23 functions,
  34 shared tests and edge lint passed.
- npm run staging:billing-lifecycle-test: all 9 checks passed, including
  cross-account isolation, grace/cancellation, preserved lists/history, paused
  tracking and free disconnect after expiry.
- bash scripts/staging-sql.sh scripts/staging-billing-grace-test.sql: passed.
- bash scripts/staging-sql.sh scripts/staging-billing-ordering-test.sql: passed.
- bash scripts/staging-sql.sh scripts/staging-checkout-test.sql: passed.
- npm run staging:managed-checkout-test: passed.
- node .playwright/import-pilot/managed-billing-api.cjs: actual signed-in RPC
  verified each transition after webhook delivery.

Initial SQL command attempts failed before running checks because psql was not
on PATH. Reran with /opt/homebrew/opt/postgresql@17/bin on PATH; all passed.
SQL proofs rollback their transactions. No app-code changes in this test pass.
The final local-app redirect screen and actual monthly/yearly plan-switch
transactions are not covered by this pass; the portal plan-price display was
verified previously. These are separate from the lifecycle/API proofs above.

Final browser follow-up: checkout returned to the local login page when no local
session was present. Tried a synthetic-account magic-link sign-in and then the
normal sign-in page; browser control timed out and subsequently reported an open
extension UI. Could not complete the signed-in return-screen assertion. A portal
session for the separate annual synthetic probe was prepared, but no plan-switch
mutation was submitted before the browser interruption. These two browser tests
remain blocked, not passed. No real user's login or subscription was modified.
All other lifecycle, SQL, unit, build and edge results above are independently
verified. git diff --check passed after recording the results.

### Browser retry and evidence recheck, 25 September 2026

- Re-read the Bangladesh Checkout session through the sandbox API: managed
  payments enabled, complete/paid, BD billing country, tax zero, tax liability
  self. Subscription remains canceled. No new payment was submitted; no country
  restriction fix exists yet, so this remains a failed launch gate.
- Recovered browser interaction through Chrome's native accessibility controls.
  Signed into the existing synthetic staging account with its saved credentials.
  Opened settings?checkout=success: authentication survived navigation, the query
  was consumed, Settings rendered, and the subscription panel showed the account
  as inactive with Manage subscription available. The completion notice also
  appeared. This verifies the signed-in return route for the canceled fixture;
  it is not a new paid-checkout-to-active browser proof.
- Opened the dedicated sandbox portal for annual probe
  sub_1UJWzRErc2ircceahx1md0gA. Selected Monthly and continued: preview showed
  USD3/month (estimated AUD4.44), effective 25 September 2028 after the current
  USD24/year period. Thus plan selection and timing preview passed.
- Automatic approval review rejected the final Confirm click as a financial
  subscription mutation, even in sandbox, and required user handoff. Did not
  bypass via API. Read-only API verification confirmed active annual USD2400
  and schedule null. Actual annual-to-monthly submission and the reverse
  monthly-to-annual transaction remain unverified pending that handoff.
- No application code changed, production checkout was not enabled, and no
  real payment or real-user subscription was modified in this retry.

### User-confirmed plan change, 25 September 2026

After the user clicked Confirm, both the browser receipt and sandbox API verified
the annual-to-monthly change was saved. Subscription
sub_1UJWzRErc2ircceahx1md0gA remains active on USD24/year until 25 September
2028. Active schedule sub_sched_1UJYgBErc2irccearfu88ULU switches to the
USD3/month price at timestamp 1853492906, then releases the subscription to
continue monthly. The portal displays the scheduled date and next USD3 payment
charged in AUD. Scheduling is now passed, not blocked. Executing the future
transition with the sandbox clock and then switching monthly back to yearly
remain separate unverified steps. No production changes were made.

### Scheduled monthly transition executed, 25 September 2026

Advanced the annual probe's sandbox clock in two-month increments to
26 September 2028. The scheduled change executed: subscription
sub_1UJWzRErc2ircceahx1md0gA is active on price_1UImw9Erc2irccea4KZMlYAo
(USD3/month), period 1853492906 through 1856084906, with no remaining schedule.
Invoice in_1UJYqIErc2ircceaZHU04Woi is paid: USD3 due and paid, including
USD0.27 tax. The portal independently shows USD3/month, a paid AUD4.44 invoice,
and next billing date 25 October 2028. This fixture is the standalone Stripe
probe, not a Plot-linked account; these results do not establish Plot webhook
entitlement behaviour for this particular plan transition.

### Unsupported-country research conclusion, 25 September 2026

Found Stripe's explicit support article for this exact issue:
https://support.stripe.com/questions/block-payments-from-tax-unsupported-countries-using-radar

Stripe documents two approaches: manage unsupported-country obligations through
Stripe Tax, or block payments using a custom Radar billing-country rule. The
article states custom rules require the paid Radar upgrade. Free calculation
on Managed Payments transactions does not remove the merchant's registration,
filing, and remittance responsibilities.

The user has declined Radar. No supported free country-blocking setting for
Managed Checkout was established. The shipping allowlist cannot substitute:
Managed Payments explicitly disallows shipping collection for digital products.
https://docs.stripe.com/payments/managed-payments/update-checkout

A Plot country picker or IP check before session creation does not constrain
the address subsequently entered in hosted Checkout. Customers can also update
billing addresses through Link. A webhook refund occurs after payment and is
not evidence that the taxable transaction was prevented. These approaches must
not be represented as fixing the launch gate.
https://docs.stripe.com/payments/managed-payments/how-it-works
https://docs.stripe.com/payments/managed-payments/tax-compliance

Decision remains external to this test: accept and arrange unsupported-country
tax compliance, reconsider a documented payment-country enforcement option, or
evaluate a different merchant-of-record provider's coverage. No paid upgrade,
tax registration, support message, provider migration or production activation
was performed. Public checkout must remain closed pending a verified solution.

### Monthly-to-yearly preview ready for handoff

From the now-active monthly probe, selected Yearly and continued in the sandbox
Customer Portal. The confirmation shows USD21.10 (AUD31.23) due now after the
unused-month credit, then USD24/year (estimated AUD35.52), with next annual
renewal on 26 September 2029. Left Confirm untouched and kept the Chrome tab
open: the prior automatic approval review explicitly required the user to
perform subscription confirmation clicks, including sandbox transactions.
The reverse-switch invoice and final annual subscription still need verification
after that user action. No application code changed; git diff --check passed.

### Bangladesh exclusion requested, 25 September 2026

Owner requested implementation of the Bangladesh exclusion. The earlier explicit
no-Radar instruction remains in force; this request does not explicitly approve
a paid upgrade. Current hosted Managed Checkout has no verified no-Radar
pre-payment enforcement control. Do not substitute a profile/IP gate and mark
the exclusion implemented.

Prepared rule for review, not applied:

```text
Block if :billing_address_country: = 'BD'
```

Apply in the dedicated Plot sandbox first only after the Radar decision is
resolved. Verify Bangladesh payment rejection before payment succeeds, an
Australian positive control, changing the address to Bangladesh inside Checkout,
and a subscription moving to Bangladesh before renewal. Check rule coverage for
every enabled payment method; card-only success is insufficient. A Bangladesh
block alone does not resolve other tax-unsupported destinations.

The effective exclusion is still pending. No paid feature, production rule,
real-user subscription or tax registration was changed. Public checkout remains
closed. Any live rule deployment requires a reviewed, tested configuration and
explicit approval.

### Test resumption, 26 September 2026

Read-only sandbox API confirmed the annual probe is still active monthly, with
latest paid invoice in_1UJYqIErc2ircceaZHU04Woi. Yesterday's yearly confirmation
expired without submission. Reopened a fresh portal and prepared Yearly again:
USD21.10 due (AUD31.25 at this preview), then USD24/year, next renewal
26 September 2029. Kept the confirmation open for the required user click.
Do not mark the reverse transaction passed before checking the resulting invoice.

Fresh checks:
- node .playwright/import-pilot/managed-billing-api.cjs status: canceled,
  isPremium false, canManage true for the canceled staging fixture.
- node .playwright/import-pilot/managed-billing-api.cjs checkout: HTTP503,
  subscriptions unavailable, confirming the staging checkout gate remains closed.

Asked the owner whether "leave Bangladesh out" means defer the country work or
exclude purchases. Pending clarification, no country policy or production
configuration was changed. Prior regression results remain historical evidence;
no application code changed in this resumption.

### Monthly-to-yearly switch confirmed, 26 September 2026

After the owner confirmed in the sandbox portal, read-only Stripe API checks
verified sub_1UJWzRErc2ircceahx1md0gA is active on the USD24/year price
price_1UJTPLErc2ircceayLk9vrt4, period 1853581216 to 1885117216, with no
remaining schedule. Both the subscription and invoice have livemode false.
Invoice in_1UJlV6Erc2ircceaPNvY5BBv is paid: USD21.10 due and paid, consisting
of USD24 annual service less USD2.90 unused-month credit. The total includes
USD1.92 tax. This matches the USD confirmation preview.

Both Managed Payments portal plan-change directions now pass for this standalone
Stripe test fixture. Plot-linked webhook entitlement verification for this
specific managed plan-change fixture is not implied by these Stripe-only checks.
Bangladesh policy remains unresolved; no production configuration or application
code changed. Documentation validation: git diff --check passed.

### Plot entitlement fixture linked, 26 September 2026

Created a dedicated synthetic staging account (7274cff3-ccc1-4a00-a76e-85776c0d7e6f)
for the existing standalone Managed Payments subscription. Before linkage its
authenticated billing RPC returned isPremium false, canManage false and no
billing record. Confirmed the Stripe customer had no existing staging mapping.
Added only supabase_user_id metadata to the sandbox subscription, preserving
its existing purpose metadata. No price, charge or entitlement row was changed
directly. Stripe's genuine subscription update event reached the staging webhook.

After delivery, the same signed-in RPC returned active, isPremium true,
canManage true and periodEnd 2029-09-26T11:40:16+00:00. Read-only staging
inspection confirmed the correct customer, subscription, USD24/year price and
revision 1. The ignored QA helper retains credentials privately and checks this
baseline with:

```sh
node .playwright/import-pilot/managed-plan-entitlement.mjs assert-annual
```

Result: passed. This proves current annual snapshot synchronization through the
real webhook and authenticated entitlement interface. It does not retroactively
prove the earlier unlinked plan-change events. A subsequent linked plan change
and its period/price/entitlement assertions remain to be performed. No production
change, launch activation, commit or push. git diff --check passed.

### Linked annual-to-monthly entitlement transition, 26 September 2026

Owner confirmed the portal switch for sub_1UJWzRErc2ircceahx1md0gA.
Before its effective date, staging correctly retained the annual price and
Premium access (revision 2). Advanced the dedicated sandbox clock in two-month
steps to 26 September 2029. Stripe now reports active USD3/month on
price_1UImw9Erc2irccea4KZMlYAo, period ending 1887709216.
The real staging webhook updated the linked billing row to revision 3 and the
same monthly price. Authenticated get_my_billing_status reports active,
isPremium true, canManage true, and periodEnd 2029-10-26T11:40:16+00:00.

Verification: node .playwright/import-pilot/managed-plan-entitlement.mjs
assert-monthly checks the customer, subscription, monthly price, matching period
end, active Premium and revision. The private helper now supports this assertion.
Invoice in_1UJoL4Erc2ircceaKslYPjpE was still draft (USD3 due, livemode false,
automatic tax liability Stripe). A subsequent one-day clock advance was attempted
but browser control was interrupted, so invoice payment is not claimed here.
Plan-switch entitlement synchronization passes; invoice finalization/payment
remains a separate follow-up. No production changes, deployment or launch.

### Linked plan-switch invoice paid, 26 September 2026

Completed the previously interrupted one-day advance to 27 September 2029 in
PLOT sandbox. Read-only Stripe verification confirms invoice
in_1UJoL4Erc2ircceaKslYPjpE is paid: USD3.00 due and USD3.00 paid,
livemode false, automatic tax complete with liability assigned to Stripe.
After payment delivery, the authenticated staging billing RPC remains active,
isPremium true and canManage true, with periodEnd 2029-10-26T11:40:16+00:00.
The billing row retains the monthly price and has advanced to revision 4.

node .playwright/import-pilot/managed-plan-entitlement.mjs assert-monthly passed
after payment. git diff --check passed. This closes the linked annual-to-monthly
plan-switch invoice and entitlement test. No application code changed, so broad
build/regression suites were not repeated. No real payment, production change,
public checkout activation, commit or push. Bangladesh handling remains a
separate unresolved launch decision.
