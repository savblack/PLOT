# Stripe test-mode verification

## Scope and status

Savannah prioritised Stripe test-mode subscriptions on 2026-09-23 and deferred
mobile verification. Public checkout remains closed. No live payment, production
configuration change, or subscription activation was performed.

The Stripe connector listed PLOT sandbox (`acct_1TquK0Erc2irccea`, livemode=false).
Read-only queries returned no prices and no webhook endpoints. The connector
then became unavailable following a session plugin change. Stripe CLI and local
Stripe API credentials were not available. Sandbox purchases, renewals, payment
failures, cancellation, plan switching, portal access and signed delivery into
staging remain **untested**. Re-enable the Stripe connector to resume setup.

## Actual handler probe

Run from the repository root:

```sh
deno run --no-config --node-modules-dir=none --no-lock --allow-env --allow-read scripts/probe-stripe-webhook.ts
```

The probe imports the actual webhook handler, captures its request handler, and
replaces network access with an isolated database double. Requests carry real
HMAC signatures generated using a local placeholder signing secret. No Stripe
or Supabase API request is sent. The process ends without persisting environment
variables. A successful probe exit means its assertions reproduced the observed
behaviour, **not** that billing is ready.

Results:
- Missing signature: rejected with 400.
- Active subscription: billing state and profile badge update successfully.
- Repeated successful event: acknowledged as a duplicate.
- Past-due subscription ending one day ago: profile flag becomes false, while
  `is_premium()` in migration `20260708000000` allows three days of grace.
- Profile update failure: returns 500 after billing was written.
- If removing the event marker also fails, retry returns duplicate success and
  never repairs the profile. Reproduced against the actual handler. A process
  crash after marker insertion has a related risk, but was not separately
  simulated in this probe.

These findings match existing readiness items for retryable/transactional event
processing and authoritative entitlement reads. They remain unresolved. Changes
need regression tests, staging validation and migration checks where applicable.

Tax configuration remains a separate launch check; no automatic tax setting was
changed during these tests.

## PLOT sandbox API execution (2026-09-23)

Connector access restored. All mutations explicitly used
`acct_1TquK0Erc2irccea`, `livemode=false`. No live-mode call was made.

Created one PLOT Premium product and two active AUD prices:
- Product: `prod_VJPhoX1JOplXs6`
- Monthly A$5: `price_1UImsKErc2ircceaRcpEdnqT`
- Yearly A$40: `price_1UImsXErc2ircceaFMw8yGps`

Stripe-side checks:
- Monthly subscription `sub_1UImtIErc2ircceaHpBBI7gm`: active; initial invoice
  `in_1UImtIErc2ircceaQpr3yHn6` paid AUD 500 minor units using a test Visa.
- Yearly subscription `sub_1UImtrErc2ircceaEVSNSLk2`: active; initial invoice
  `in_1UImtrErc2irccear0kaZdRK` paid AUD 4000 minor units using a test Visa.
- Monthly cancellation scheduled at period end, then reversed: both updates
  succeeded and the subscription stayed active.
- The monthly subscription was then changed to the yearly price with proration
  explicitly disabled. Stripe confirmed active state and the yearly price.
  This does not prove the intended portal proration policy or a new paid annual
  invoice; the returned latest paid invoice still showed 500 minor units.
- A separate customer-creation attempt with `pm_card_chargeDeclined` returned
  `card_declined`. This is a Stripe test-card rejection, not a tested failed
  Checkout purchase or renewal.

Synthetic customers have no email address and purpose metadata identifying QA.
The monthly customer's test clock is `clock_1UImspErc2ircceazA16fwIx`.
The connector can create clocks but does not expose advancement (search and
operation lookup both failed). Renewal, failed-renewal recovery and terminal
expiry were therefore not simulated. The test subscriptions remain in the
sandbox for follow-up; no production users or PLOT entitlement rows were linked.

Hosted Checkout, portal flows, signed delivery into PLOT staging, entitlement
activation/downgrade, preserved lists and calendar access remain unverified.
Staging needs sandbox credentials and a configured webhook before those tests.
Public checkout stays closed. Automatic tax was not enabled; tax setup remains
a separate launch check.

## USD pricing supersedes AUD tests (2026-09-23)

Savannah changed Premium to US$3/month and US$25/year. Shared plan constants,
web/marketing copy and server validation now use USD 300/2500 minor units.
Annual effective monthly price is US$2.08, with a rounded 31% saving.

New PLOT sandbox prices:
- Monthly: `price_1UImw9Erc2irccea4KZMlYAo` (product default).
- Yearly: `price_1UImwCErc2ircceaORvnsHkZ`.

Both earlier AUD prices are archived. Existing synthetic AUD subscriptions
were retained as historical evidence; their successful payments do not prove
USD checkout. No live price, deployed secret, tax configuration or public
checkout switch changed. USD execution results follow below.

Verification: seven Premium unit tests and two billing-policy tests passed.
`pnpm run check` passed with zero errors and 189 existing warnings.
`pnpm run edge:check` initially hit a sandbox cache error, then passed on the
approved rerun: 23 functions typechecked, shared tests passed and 56 files linted.
`git diff --check` passed. No mobile source changed; mobile receives the updated
shared labels. Device testing remains deferred.

## USD Checkout and portal execution (2026-09-23)

All operations used PLOT sandbox `acct_1TquK0Erc2irccea`, `livemode=false`.
No real card, customer or PLOT entitlement was used.

- Monthly API subscription `sub_1UIn1uErc2ircceabuxu0MV9` was active with
  invoice `in_1UIn1vErc2ircceaDy1FhGZL` paid USD 300 minor units.
- Yearly API subscription `sub_1UIn23Erc2ircceajHRJS543` was active with
  invoice `in_1UIn23Erc2ircceaFji7hryR` paid USD 2500 minor units.
- Hosted Checkout visibly showed PLOT sandbox, PLOT Premium and US$3/month.
  A synthetic email and Stripe's test Visa completed the payment. Read-back of
  session `cs_test_a1wV1djUOMPRH4iOdxTNIqxrR9C97hCH6fYwIgpZ7bPQIbLPM9X0yZ05hV`
  confirmed `status=complete`, `payment_status=paid`, `amount_total=300`,
  `currency=usd`, `livemode=false`.
- Checkout created subscription `sub_1UIn6RErc2ircceawW3Eo60p` and invoice
  `in_1UIn6QErc2ircceavRYgQkUU`. The portal displayed its US$3 paid invoice.
- Portal cancellation showed access continuing until 23 October 2026, then
  displayed the scheduled cancellation. Reversal restored the next billing date
  and the Cancel subscription action. Both flows were exercised in the browser.
- The scheduled cancellation used `cancel_at=1792750117`, equal to the item's
  period end, while `cancel_at_period_end=false`. The webhook now normalises this
  form to PLOT's stored period-end flag. Regression coverage checks timestamp
  cancellation, reversal, terminal cancellation, missing dates and unrelated
  cancellation dates. Arbitrary mid-period cancellation is not relabelled as
  period-end cancellation.
- Checkout's initial return failed because the local server was stopped. After
  restarting the staging-backed preview, the portal return reached PLOT's login
  page. This proves navigation only, not an authenticated Premium activation.

The sandbox had no webhook endpoints when checked. These sessions were created
directly through Stripe, without PLOT user linkage. Annual hosted Checkout,
plan switching, failed renewal/recovery, signed staging delivery, entitlement
expiry and preserved free-user access remain unverified. The default portal did
not expose plan switching. Configure and test its two-price catalogue before
calling that capability ready.

Verification after the cancellation fix:
- `pnpm run check`: passed (lint and build).
- `pnpm run edge:check`: passed; 23 functions typechecked, 21 shared tests passed,
  56 edge files linted.
- `deno run --no-config --node-modules-dir=none --no-lock --allow-env --allow-read scripts/probe-stripe-webhook.ts`:
  passed cancellation/reversal assertions against the actual handler. The probe
  still reproduces the known failed-marker-cleanup defect and grace mismatch;
  its successful exit does not mean these defects are fixed.
- `git diff --check`: passed.

No schema migration, deployment, live subscription activation or commit was made.

## Subscription and access follow-up (2026-09-23)

All Stripe operations below used **PLOT sandbox**, `acct_1TquK0Erc2irccea`,
`livemode=false`. Public checkout is still closed. Plex was left paused.

### Hosted payment and plan changes

- Annual hosted Checkout `cs_test_a14kp8OdrmsTkXGShmZqPoyPhZG5tBOfKA2oQghEBJ27CSbU6W6Avdx0xK`
  showed US$25/year and US$2.08/month billed annually. The decline test card
  produced a visible rejection. Retrying the same session with the successful
  test Visa produced `status=complete`, `payment_status=paid`, `amount_total=2500`,
  `currency=usd`; subscription `sub_1UIpj8Erc2ircceasQ912dc7`.
- Created a separate QA portal configuration `bpc_1UIpVVErc2ircceam3Dwv9WG`,
  restricted to the two USD prices. It does not replace the default portal.
- On existing synthetic subscription `sub_1UIn6RErc2ircceawW3Eo60p`, the initial
  `billing_cycle_anchor=unchanged` / `create_prorations` configuration previewed
  **US$47** (a prorated annual charge plus another annual line). This was NOT
  confirmed. Changing the QA configuration to `billing_cycle_anchor=now` and
  `proration_behavior=always_invoice` previewed US$22.01: one US$25 year less
  unused monthly credit. Confirmed; the portal showed the US$22.01 invoice paid
  and the current plan US$25/year. API read-back confirmed paid invoice
  `in_1UIpawErc2ircceaR6F8KQKB`, USD 2201 minor units.
- The reverse switch was confirmed as a scheduled change to US$3/month on
  23 September 2027. The portal retained the paid yearly plan until then. API
  read-back confirmed schedule `sub_sched_1UIpdOErc2ircceafbnwMWnp`.
- The tested configuration uses `schedule_at_period_end.conditions` containing
  `shortening_interval`. Payment-method updates and invoices are available;
  cancellation is at period end. No tax setting changed.

These remain Stripe-side synthetic purchases, not purchases linked to PLOT
accounts. A payment succeeded; entitlement delivery into staging is not proven.

### Local fixes, not deployed

`20260923100000_atomic_stripe_subscription.sql` adds a service-role-only RPC
that commits billing state, the profile badge and the receipt in one transaction.
An account-scoped transaction lock serializes competing writes and the event-time
guard rejects older events. A late deletion for a replaced subscription is ignored.
Badge calculation delegates to the existing `is_premium()` policy, including grace.
The webhook calls that RPC and treats mapping/transaction failures as retryable.
The signed isolated handler probe now asserts recovery instead of reproducing a
stranded receipt. Concurrent delivery and equal-timestamp provider ordering still
need dedicated live delivery checks before launch.

A self-only `get_my_billing_status()` RPC exposes management availability and
status without Stripe IDs. Web reads entitlement from `is_premium()` at profile
load, on window focus and once a minute while visible. Settings retains portal
access for expired subscribers and distinguishes past-due payment, termination,
and scheduled cancellation. Shared reads live in core; native wiring is deferred
at Savannah's request.

The billing edge function now accepts server-only `STRIPE_SETTINGS_URL` and
`STRIPE_PORTAL_CONFIGURATION` so staging returns to the QA app and uses the tested
portal without changing production defaults. `.env.example` contains USD placeholders.

The deployed staging `export-user-data` preflight returned HTTP 401 without CORS
headers. The local handler now answers OPTIONS with 204 and adds CORS headers to
success/error responses; actual exports still verify Auth and use caller RLS.
This fix needs deployment before browser exports work against that endpoint.

### Verification evidence

- `pnpm run test:unit`: 304 web + 643 core tests passed.
- `pnpm run check`: lint and build passed, zero errors, existing warning backlog.
- `pnpm run edge:check`: 23 functions typechecked, 23 shared tests passed, edge lint clean.
- `deno run --no-config --node-modules-dir=none --no-lock --allow-env --allow-read scripts/probe-stripe-webhook.ts`:
  signed handler checks passed, including failed transaction retry, outage recovery,
  grace, cancellation and replay. The database is a double in this probe.
- `deno run --node-modules-dir=none --allow-env --allow-read scripts/probe-export-handler.ts`:
  OPTIONS 204, unauthenticated POST 401 and GET 405 all include CORS headers.
- `node .playwright/import-pilot/staging-db.cjs scripts/staging-billing-lifecycle-test.sql`:
  nine assertion groups passed in one transaction ending in ROLLBACK. It uses only
  synthetic import-pilot users. Proved five-list cap, sixth Premium list, duplicate
  and older events, injected badge failure atomicity, retry, grace expiry, retained
  list editing/history, paused in-flight sync, free disconnect and cross-account
  billing-status isolation. No persistent schema or account change.
- `node scripts/verify-web-billing.cjs .playwright/import-pilot`: passed against fresh
  local preview port 5184. Real staging login, controlled billing responses, stale
  badge override, visible/retryable portal failure, termination/cancellation copy,
  and real staging data export through the **local** fixed handler on port 5195.
  No uncaught page errors. This is not deployed Stripe activation evidence.

The older `staging:tracking-jobs-test` harness cannot be rerun against an already
migrated staging schema: it attempts to recreate `watch_events`. Its transaction
rolled back. The scoped billing test above exercises current deployed tracking
functions instead, without recreating their schema or contacting providers.

### Remaining test boundary and requested next action

Finish renewal, failed-renewal recovery and signed staging delivery with a PLOT
sandbox key, endpoint signing secret and test-clock controls. The connector does
not expose test-clock advancement; the Dashboard login is pending. Do not paste
keys into chat. Store credentials only in the staging secret store or private
local environment.

The approved staging rollout was completed on 2026-09-24: the billing migration
and `stripe-billing`, `stripe-webhook`, and `export-user-data` are deployed to **PLOT
Staging only**. Public/production checkout stays closed. Stage migration first,
then functions; the new webhook requires the RPC. Production deployment, live
subscriptions, checkout concurrency hardening, tax setup and mobile verification
remain separate launch gates.

Final import regression checks in this follow-up:
- `PLOT_SMOKE_PORT=4275 pnpm --filter @plot/web exec playwright test tests/smoke/history-import.spec.js tests/smoke/streaming-import.spec.js`:
  35 passed, including lost-response retry, interrupted batches and no duplicate watches.
- `PLOT_QA_BASE_URL=http://127.0.0.1:5184 node scripts/verify-import-session-recovery.cjs .playwright/import-pilot`:
  real staging catalogue, expired-session refresh, rejected-refresh sign-in recovery
  and duplicate-free reimport passed; no uncaught page errors.
- `pnpm run staging:billing-lifecycle-test`: all nine groups passed, rolled back.
- `git diff --check`, `copy:check`, `core:check`, `db:block-clause`: passed.

The original preview on port 5183 served stale modules despite filesystem edits.
The verification was rerun on a fresh preview on port 5184; no stale-preview result
is counted as proof of the new billing code. Initial sandbox restrictions blocked
local PostgreSQL/Chrome/Deno-cache access; approved reruns succeeded.

Final schema checks: `pnpm run db:migration-test` passed all seven pending
migrations against a temporary production restore. `pnpm run db:function-diff`
listed new functions only, including both billing RPCs; no existing production
function body was replaced. Both temporary databases were torn down. Production
was read-only. No commit, push, production deployment or live activation occurred.

## Approved staging rollout: 2026-09-24

Applied migration `20260923100000` and recorded its migration history atomically
on staging `uzrhfivnhdcfieuaxzip`, then deployed `stripe-billing`,
`stripe-webhook` and `export-user-data` using `scripts/supabase-staging.mjs`.
Production was not changed. No commit or push occurred.

- `node .playwright/import-pilot/staging-db.cjs scripts/staging-billing-lifecycle-test.sql`: all nine assertion groups passed against the deployed RPCs; fixtures rolled back. The harness now skips migration creation when its RPC already exists.
- `node scripts/verify-web-billing.cjs .playwright/import-pilot`: all five groups passed; export now downloads through the deployed staging endpoint. Billing responses remain controlled UI fixtures, not proof of Stripe delivery.
- Deployed export OPTIONS returned 204 with CORS; unauthenticated POST returned 401 with CORS.
- Stripe webhook POST and billing OPTIONS returned 500. A secret-name-only inspection found no `STRIPE*` configuration in staging. These endpoints are deployed but not payment-ready.
- `git diff --check`: passed. Earlier full build/unit/edge/schema checks remain recorded above; this follow-up changed only verification scripts and documentation.

Remaining: configure the PLOT sandbox API key, webhook signing secret, prices and
portal settings in staging, then prove signed delivery and renewal/recovery.
Chrome had no Stripe Dashboard tab open at verification time. Keep credentials
out of chat and tracked files. Production checkout remains closed.

## Signed sandbox activation: 2026-09-24

Created `PLOT staging billing`, a restricted sandbox key: Customers, Products,
Prices and Subscriptions read; Customer Portal and Checkout Sessions write.
Saved it as `STRIPE_SECRET_KEY` in PLOT Staging through the encrypted secret store.
No production credential or checkout setting changed.

Configured sandbox webhook `we_1UJ16JErc2ircceaA8o7iLZx` to the staging
`stripe-webhook` endpoint, API version `2026-08-26.dahlia`, with the three events
handled by the deployed function. Saved its signing secret, USD prices, tested
portal configuration and local Settings return URL in staging.

Using synthetic import-pilot account 1 (no real user data):
- Deployed `stripe-billing` created Checkout successfully with the restricted key.
- Hosted Checkout completed with Stripe's 4242 test card. Stripe confirmed paid,
  USD 300, subscription `sub_1UJ196Erc2ircceaiLwXWLSU`.
- Actual signed webhook delivery changed the self-only billing RPC from no
  subscription/free to active/Premium, ending 2026-10-24. No manual entitlement write.
- The deployed portal action returned HTTP 200 and a sandbox portal URL.
- Setting cancellation at period end through Stripe propagated to PLOT while
  retaining Premium. Reversing cancellation also propagated to PLOT, restoring
  `cancelAtPeriodEnd: false` while keeping active Premium.
- Staging checkout was closed again after the controlled purchase; the deployed
  checkout action returned HTTP 503 with the expected not-available message.

Remaining: natural renewal/test-clock advancement, failed-renewal recovery,
concurrent/equal-timestamp delivery, first-checkout concurrency hardening, and
final real browser lifecycle assertions. The connector still exposes clock
creation but not advancement. The synthetic monthly subscription is retained for
further lifecycle checks. Prior exposed sandbox keys still need rotation; the
new key was handled without printing its value.

## Durable checkout coordination: 2026-09-24

Added a service-only checkout attempt record, exclusive expiring lease and stable
Stripe idempotency keys. Customers are saved before creating Checkout. Repeated
requests reuse the open session; changing plans expires the previous session.
An uncertain creation older than 23 hours fails closed for operator review.
Existing non-terminal subscriptions route to the portal rather than permitting
another purchase. A completed session may be replaced after its subscription ends.

With Savannah's approval, applied and recorded migration `20260924020000` on
PLOT staging `uzrhfivnhdcfieuaxzip`, then deployed `stripe-billing` there.
Production remains unchanged and checkout remains closed.

Verification:
- `pnpm run check`: passed, existing warnings only.
- `pnpm run edge:check`: passed, 23 functions typechecked, 29 shared tests and 58 linted files. Six new checkout tests cover concurrent requests, response loss, plan changes, expired idempotency, existing subscriptions and resubscription.
- `pnpm run db:migration-test`: all eight pending migrations applied to a temporary production restore; temporary database destroyed.
- `pnpm run db:function-diff`: new functions only; no existing production function bodies replaced.
- `node .playwright/import-pilot/staging-db.cjs scripts/staging-checkout-test.sql`: passed against the deployed schema; client access denied, exclusive claim, stable retry identity and stale-writer fencing. All fixture changes rolled back. The harness supports repeat execution against the installed migration.
- `node .playwright/import-pilot/billing-api.cjs checkout`: HTTP 503, expected closed-checkout message.

Stripe prompted for phone verification when saving the approved change from
Customers read to write on `PLOT staging billing`. The save is not yet confirmed.
The new first-purchase path must still be tested against Stripe after verification;
unit and SQL tests are not evidence of that live sandbox result. Natural renewal,
failed-renewal recovery, equal-timestamp event delivery and final browser lifecycle
assertions also remain outstanding.

## Deployed concurrency and renewal/recovery: 2026-09-24

Savannah completed Stripe's phone verification. Reopening the key editor showed
Customers **Write** selected for `PLOT staging billing`.

- `.playwright/import-pilot/checkout-live.mjs` created a private synthetic staging
  billing account and made four simultaneous requests to the deployed handler.
  One returned a Checkout URL and three were blocked. Monthly retries reused the
  URL; yearly selection replaced it; yearly retries reused the new URL. The lease
  was released. Staging checkout was closed in `finally`, then verified HTTP 503.
- Improved safe pending-checkout errors to HTTP 409 with retry guidance. Edge
  checks passed and the handler was redeployed only to staging. Repeating the
  real pilot returned `[409, 200, 409, 409]` and passed every assertion above.
- Attached sandbox test clock `clock_1UJ243Erc2ircceawz6s59ZE` to synthetic customer
  `cus_VJeRTQZmutgemI`. Advanced through October renewal and invoice finalization.
  Invoice `in_1UJ24iErc2irccealoi3V01E` was paid USD 300. Actual signed delivery
  advanced PLOT's period end to 2026-11-24.
- Saved Stripe's synthetic decline-on-charge card ending 0341 and selected it for
  this test subscription only. November renewal invoice
  `in_1UJ284Erc2ircceaOH6L6ypm` failed: open, USD 300 due, zero paid, one attempt.
  Both Stripe and PLOT reported `past_due`.
- Restored the original 4242 test payment method and charged the sandbox invoice.
  Stripe confirmed paid USD 300 and active; PLOT's actual RPC confirmed active,
  Premium, manageable billing and period end 2026-12-24.
- `.playwright/import-pilot/verify-real-billing.cjs .playwright/import-pilot`
  passed actual staging sign-in and Settings assertions without mocked billing:
  Premium and Manage subscription visible, no uncaught page errors. The first
  attempt found the local preview stopped; the test passed after restarting the
  staging-configured preview on 5184.
- `pnpm run check`, `pnpm run edge:check`, and `git diff --check`: passed after
  the pending-checkout response fix.

### Newly discovered grace defect and prepared fix

The failed-renewal subscription's period end advanced to December despite its
unpaid November invoice. Existing `is_premium` used that date for three-day
grace, allowing an unpaid month (or year). Stripe test clocks also do not advance
Postgres `now()`, so clock simulation alone cannot prove access expiry.

Prepared `20260924030000_billing_grace_start.sql`: preserve the first past_due
event timestamp per subscription, retain it across retries, clear it on recovery,
and require it to be within three days in the entitlement RPC. The existing
active/trialing predicate is retained. The live production RPC was read before
editing. This migration was subsequently deployed to staging with approval below.

`scripts/staging-billing-grace-test.sql` passed in one rolled-back staging
transaction: an unpaid future annual period is denied after grace; retries do
not extend grace; recovery resets it; a new failure receives grace; canceled
access is denied. `pnpm run check` passed and `pnpm run db:migration-test` applied
all nine pending migrations successfully to a disposable production restore.
`pnpm run db:function-diff` confirmed only one added predicate in the existing
`is_premium` body, zero removed lines; the trigger function is new. The temporary
database was destroyed after both checks.

## Approved grace rollout: 2026-09-24

Applied `20260924030000_billing_grace_start.sql` and its migration-history record
atomically to staging `uzrhfivnhdcfieuaxzip`. The preflight initially stopped on
whitespace differences in the staging function. Inspection confirmed identical
logic; the whitespace-normalized guard passed before applying the migration.
No production mutation, commit or push occurred.

Post-deployment verification:
- `node .playwright/import-pilot/staging-db.cjs scripts/staging-billing-grace-test.sql`: passed all grace assertions.
- `node .playwright/import-pilot/staging-db.cjs scripts/staging-billing-lifecycle-test.sql`: all nine groups passed, including cross-account isolation, expiry, disconnect and retained history/lists.
- `node .playwright/import-pilot/staging-db.cjs scripts/staging-checkout-test.sql`: passed client denial, exclusive claims, retry identity and stale-writer fencing.
- All three SQL proofs rolled back their synthetic fixtures.
- `node .playwright/import-pilot/billing-api.cjs status`: the recovered synthetic subscriber remains active and Premium, with billing management available.
- `node .playwright/import-pilot/billing-api.cjs checkout`: HTTP 503, checkout remains closed.

Remaining: complete equal-timestamp/concurrent webhook ordering hardening and
rotate the previously exposed old sandbox keys. Production checkout remains closed.

## Adaptive Pricing decision and configuration: 2026-09-24

Savannah confirmed US$3/month and US$25/year as base prices, with Stripe Adaptive
Pricing elsewhere. The PLOT sandbox account `acct_1TquK0Erc2irccea` displayed
`Enable Adaptive Pricing` checked in Settings > Payments > Adaptive Pricing.
Supported currencies shown include AUD, GBP and EUR. No setting was changed;
hosted Checkout already inherits this setting because the handler omits a
per-session override. USD base-price validation remains correct.

The existing annual sandbox link could not be fully inspected: the initial
URL omitted its required fragment, and after restoring the original URL the
browser stalled. This is not evidence of a currency-conversion failure or a
successful localized checkout. Local-currency purchase, renewal, portal plan
switching and refund assertions remain pending. Production Adaptive Pricing
was not inspected or changed; live checkout remains closed.

## Webhook ordering fix prepared: 2026-09-24

Added `billing_customers.revision` and service-only
`apply_stripe_subscription_snapshot`. The handler reads the revision, retrieves
the current subscription from Stripe, then applies only if the revision is
unchanged under the existing per-account transaction lock. A conflict retries
with a fresh revision and Stripe read, up to three times, then returns a retryable
failure. The wrapper increments revision in the same transaction as billing,
badge and receipt writes. Existing duplicate/older-event guards are retained.
Historical payloads are no longer the source of subscription state.

Verification:
- `pnpm run edge:check`: 23 functions, 32 shared tests, 60 linted files passed.
- `deno run --node-modules-dir=none --allow-env --allow-read --allow-net scripts/probe-stripe-webhook.ts`: signed real-handler probe passed, including current-state retrieval despite an obsolete event payload, database failure/retry and Stripe lookup failure/retry. External services are stubbed in this probe.
- `node .playwright/import-pilot/staging-db.cjs scripts/staging-billing-ordering-test.sql`: passed service-only access, first snapshot, stale revision retry without receipt, equal-time cancellation, stale competing state rejection and duplicate idempotency; fixtures and migration rolled back.
- `pnpm run db:migration-test`: all ten pending migrations applied to a disposable production restore.
- `pnpm run db:function-diff`: the snapshot RPC is new; the earlier grace predicate remains the sole existing-body change, with zero removed lines.
- `pnpm run check`: passed. An initial probe invocation omitted the repository's Deno isolation flag and failed; the corrected command above passed. Deno's incidental package.json workspace addition was removed.

This migration and handler were subsequently deployed to staging with approval
as recorded below. No production change, commit or push.

## Adaptive Pricing account constraint: 2026-09-24

Recovered browser access using a fresh tab. The PLOT annual hosted Checkout
rendered USD 25.00 only. Stripe's session API confirmed
`adaptive_pricing.enabled: true`, subscription mode, USD integration currency.
Updated only the synthetic customer `cus_VJfNaUzP7worwO` to a UK-location test
email and created new sessions through the deployed PLOT staging handler. The
new annual session still rendered USD only. No purchase was submitted.
Staging checkout was closed in cleanup and verified HTTP 503.

Read-only inspection of sandbox account `acct_1TquK0Erc2irccea` found country AU,
default currency AUD, and only AUD among configured external settlement accounts.
Stripe's documentation requires the integration/price currency to match a
settlement currency. This is a concrete configuration gap consistent with the
missing currency selector; USD settlement must be configured and the flow
retested before claiming local-currency support. No bank configuration was changed.

Source: [Adaptive Pricing eligibility](https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing?payment-ui=embedded-components).
Local-currency purchases, renewals, portal changes and refunds remain unverified.

## Approved webhook ordering rollout: 2026-09-24

Savannah explicitly approved deploying the webhook fix to staging. Applied
`20260924040000_billing_snapshot_guard.sql` and its migration-history record in
one transaction on `uzrhfivnhdcfieuaxzip`, then deployed `stripe-webhook` through
`node scripts/supabase-staging.mjs functions deploy stripe-webhook`.

Post-deployment verification:
- `node .playwright/import-pilot/staging-db.cjs scripts/staging-billing-ordering-test.sql`: passed all revision, equal-time, duplicate and access assertions.
- `node .playwright/import-pilot/staging-db.cjs scripts/staging-billing-grace-test.sql`: passed all grace assertions.
- `node .playwright/import-pilot/staging-db.cjs scripts/staging-billing-lifecycle-test.sql`: all nine groups passed, including account isolation and free access after expiry.
- All SQL fixtures rolled back.
- Actual Stripe sandbox subscription `sub_1UJ196Erc2ircceaiLwXWLSU` was set to cancel at period end. Signed delivery changed PLOT's cancellation flag to true and revision from 0 to 1 while retaining active Premium.
- Restored cancellation to false through Stripe. Signed delivery restored PLOT's flag and advanced revision to 2. The synthetic subscription is active, Premium and manageable, ending 2026-12-24.
- `node .playwright/import-pilot/billing-api.cjs checkout`: HTTP 503, expected closed-checkout message.

Production was unchanged. No commit or push. Remaining billing blockers are
USD settlement and local-currency lifecycle verification, old sandbox-key rotation,
and the separately approved production launch configuration and rollout.

## Sandbox USD settlement and localized checkout: 2026-09-24

Inspected PLOT sandbox's Linked accounts and payouts settings. Settlement
currencies can be added separately from bank accounts. Enabled USD in sandbox
`acct_1TquK0Erc2irccea`, retaining AUD as default; no bank details or production
settings changed. The settings table now lists USD (0.91%). Stripe's public
Australian multi-currency settlement table lists 1%; confirm the live account's
applicable rate before production enablement rather than assuming either rate.
This merchant settlement fee is separate from customer Adaptive Pricing FX fees.

Verification:
- `node .playwright/import-pilot/checkout-live.mjs`: passed. Concurrent requests returned `[409, 409, 200, 409]`; retries reused the session, plan changes replaced it, and the lease was released.
- Cleanup closed staging checkout and verified HTTP 503.
- The fresh annual Checkout session `cs_test_b1edxCfBwDJt6AMCdSbWsQHYHes0oo7mdMWQB1OqUyqEEZ31Pp8IX02BPK` displayed GBP 19.64/year for the synthetic UK-location customer, with a USD alternative and displayed exchange rate 1 USD = 0.7858 GBP. The underlying price remains USD 25/year.
- No purchase was submitted. Localized payment, renewal, plan-change and refund verification remains outstanding.

USD bank details were not needed for this sandbox setting. A supported matching
bank account is required for payouts in USD; production payout arrangements and
fees remain a separate launch decision. No production changes, commit or push.

Source: [Stripe multi-currency settlement](https://docs.stripe.com/payouts/multi-currency-settlement).

## Local-currency lifecycle pilot: 2026-09-24

Used the existing synthetic staging customer `cus_VJfNaUzP7worwO`, PLOT sandbox
`acct_1TquK0Erc2irccea`, and Stripe's 4242 test card. No real payment, bank
details, production configuration or tax setting was changed.

- Annual GBP Checkout completed: session `cs_test_b1edxCfBwDJt6AMCdSbWsQHYHes0oo7mdMWQB1OqUyqEEZ31Pp8IX02BPK`, subscription `sub_1UJ4PXErc2ircceahNjKlUIP`, invoice `in_1UJ4PVErc2ircceaxMJwSxCF`. Stripe confirmed `paid`, USD base 2500 and GBP presentment 1964. PLOT's authenticated status RPC returned active, Premium, manageable, period end 2027-09-24.
- Attached test clock `clock_1UJ4QlErc2ircceaz5mdncMr` to that synthetic customer. Advanced through the annual renewal and invoice finalization. Invoice `in_1UJ4SIErc2ircceaT5zhjq2u` was paid for the subscription cycle. Payment `pi_3UJ4T6Erc2irccea1ReTReDv` succeeded with USD base 2500 and GBP presentment 1964. PLOT's period end advanced to 2028-09-24 and Premium remained true.
- Fully refunded the original payment `pi_3UJ4PWErc2irccea1P5RvIof`. Refund `sandbox-refund-reference-retained-in-Stripe` succeeded, returning GBP 1964 (USD base 2500). The refund did not cancel the ongoing subscription; PLOT remained Premium after the paid renewal.
- The customer portal displayed the USD base plan, "Charged in GBP", and GBP invoice amounts. Its monthly switch confirmation quoted approximately GBP 2.36 for USD 3 and correctly deferred the change until the paid annual period ended. Schedule `sub_sched_1UJ4TiErc2irccea1DBQiMc4` executed on simulated 2028-09-24. Invoice `in_1UJ4e6Erc2ircceaq3ermHmm` was paid; payment `pi_3UJ4eAErc2irccea1JkIlhtU` succeeded for USD base 300 / GBP presentment 236. PLOT saved the monthly price, period end 2028-10-24, revision 5 and Premium true.
- Monthly renewal also passed: invoice `in_1UJ4euErc2ircceaePlEUssU`, payment `pi_3UJ4ewErc2irccea0LhgKXAH`, USD base 300 / GBP presentment 236. PLOT's period end advanced to 2028-11-24.
- Switched monthly back to yearly through the portal on simulated 2028-10-29. The preview applied unused-month credit and quoted GBP 17.66 / USD 22.48 due immediately. Invoice `in_1UJ4fcErc2ircceaVX742Ze9` and payment `pi_3UJ4fdErc2irccea1pIO7Yxl` confirmed those exact paid amounts. PLOT saved the annual price, active status, end 2029-10-29, revision 7 and Premium true.
- Simulator limitation: a pending monthly phase reduced the maximum clock step to two months, despite the subscription page initially showing the older annual limit. The exact maximum date also triggered a Dashboard boundary-validation tooltip. Smaller steps on the canonical simulation page completed successfully. These rejected advances did not change PLOT or the subscription.
- `node .playwright/import-pilot/localized-billing-api.cjs status`: authenticated entitlement checks passed. Read-only staging SQL confirmed annual price, active status, period end 2028-09-24, revision 3 and authoritative Premium true after renewal.
- `node .playwright/import-pilot/localized-billing-api.cjs checkout`: HTTP 503, checkout remains closed.

These are actual sandbox API and signed-webhook results, not mocked lifecycle
tests. Tax collection remains untested and requires separate registration/setup
verification before launch.

Fresh monthly checkout follow-up:
- `node .playwright/import-pilot/monthly-checkout-live.mjs`: passed, synthetic staging account only; concurrent statuses `[409, 200, 409, 409]`, stable monthly session on retry and lease released. Cleanup closed checkout and verified HTTP 503.
- Session `cs_test_b1gu5lVPrM7sXRIyAKjotdcA5Mf5WqELpyiVIarUuAARTCLygPMa7wiObR`, customer `cus_VJi7618AAnSenV`: Stripe confirms USD base 300 with AUD presentment 444, test mode, still open/unpaid.
- Chrome stopped browser automation because another extension UI was open on the checkout page. No payment was submitted for this fresh monthly signup. The user must dismiss that extension UI before this browser test can resume. GBP monthly billing through the portal and its renewal have passed as recorded above; a fresh monthly checkout payment is still outstanding.
- `git diff --check`: passed. Only documentation and ignored QA helpers changed in this turn; no application-code change, deployment, commit or push. Existing full build/edge/schema checks are recorded in the preceding sections and were not rerun for this documentation-only update.

### Fresh monthly signup completed: 2026-09-24

On resuming, Chrome's temporary extension block had cleared without requiring
the user to find a popup or change extension settings. The existing monthly
session above completed with Stripe's 4242 test card and a synthetic example.com
email. Stripe confirmed `complete`, `paid`, `livemode: false`, AUD presentment
444 against the USD 300 monthly base price. Subscription
`sub_1UJ4jmErc2ircceaGMQN3uYA`, invoice `in_1UJ4jlErc2ircceard7jNy0p`.

`node .playwright/import-pilot/monthly-billing-api.cjs status` confirmed active,
manageable, authoritative Premium true and period end 2026-10-24 following the
signed webhook. Its `checkout` action returned HTTP 503, confirming staging
checkout remains closed. This resolves the fresh monthly signup blocker above.

The planned localized sandbox scenarios now pass: direct monthly AUD and annual
GBP purchase, GBP monthly and annual renewal, both portal plan-change directions
(scheduled shortening and immediate prorated upgrade), and a full GBP refund.
This is not certification of every currency, payment method, tax arrangement or
production configuration. No real funds, production changes, deployment, commit
or push. `git diff --check` passed; no application code changed.
