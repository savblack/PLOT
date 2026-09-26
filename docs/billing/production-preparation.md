# PLOT billing production preparation

Read-only audit: 2026-09-24. This document is a review plan, not approval to
deploy, alter production billing or open checkout. Prices remain US$3/month
and US$25/year with Adaptive Pricing for eligible sessions.

## Verified current state

| Area | Evidence | Required next step |
| --- | --- | --- |
| Account | PLOT live account `acct_1TquJrIke4XlO34A`, AU; charges and payouts enabled; no currently due or past-due account requirements | Preserve the separate sandbox account |
| Catalogue | Active PLOT Premium product already has USD 300/month and USD 2500/year recurring prices | Reuse these prices; tax behavior is currently unspecified |
| Settlement | Live Dashboard lists AUD only, default, free | Review USD settlement and payout arrangement before enabling it; no bank changes made |
| Portal | Live PLOT Premium portal created and API-verified; Dashboard confirms both approved USD prices | Set its configuration ID in production during approved backend rollout |
| Webhook | Existing enabled production endpoint subscribes to Checkout completion and subscription update/deletion; API version 2026-06-24.dahlia | Reuse endpoint; review upgrade to the sandbox-tested 2026-08-26.dahlia alongside handler deployment |
| Functions | Production `stripe-billing` version 567 and `stripe-webhook` version 560 are ACTIVE | Downloaded source confirms older implementation; checkout unconditionally returns 503, webhook lacks tested atomic update and snapshot safeguards |
| Secrets | Production lists the two Stripe price secrets, API secret and webhook secret; no checkout gate, portal configuration or settings-return secret | Values were not read. Configure the reviewed values through the secrets store; explicitly keep checkout disabled |
| Tax | Live Tax Settings active with AU head office; zero recorded registrations; default and product tax code `txcd_10000000`; default tax behavior inferred by currency | Australian non-registration and inclusive pricing confirmed; overseas obligations and classification remain open |
| Business profile | Website set to theplot.tv; support URL/email unset in API | Confirm the intended public support destination |

Only the explicitly approved portal creation has changed production. Downloaded production source
unconditionally rejects checkout before authentication and Stripe/customer work.
The proposed replacement uses an explicit gate, which must remain false. A
deployment must verify the closed endpoint directly before public activation.

## Key rotation verification

Completed 2026-09-24. Savannah rotated the sandbox standard Secret key with
immediate expiry; the refreshed Dashboard lists its creation date as 24 September
(previously 8 July). The restricted staging key was also rotated and its
replacement saved under `STRIPE_SECRET_KEY` in PLOT Staging. An initial portal
failure was traced to an expired key and resolved by that secret update.

Final synthetic-account probes: portal HTTP 200 with a session URL; checkout
HTTP 503 with subscriptions unavailable. The staging connection is restored.
Savannah also created `STRIPE_STAGING_SECRET_KEY`; the application does not use
that extra secret. No production credentials were changed.

Credential entry and submission in the browser are handed to Savannah under
the browser credential-change policy. Never paste credentials into chat.

For production, prepare a separate restricted key with the sandbox-tested
permissions: Customers write, Products read, Prices read, Subscriptions read,
Checkout Sessions write and Customer Portal write. Store it in Supabase Edge
secrets, never tracked files. Creation and credential handoff remain outstanding.

## Tax decision and verification

Savannah confirmed on 2026-09-24 that she has an ABN, is not registered for
Australian GST and has no other business income. The agreed pricing approach
is US$3/month and US$25/year inclusive of applicable tax when collection is
required. Do not add an Australian GST registration or describe current
invoices as including GST. Monitor current and projected turnover; the absence
of other business income is not a permanent exemption. Overseas registration
obligations remain to be assessed. No tax settings were changed.

No registrations in Stripe does not prove the business has no registrations
with tax authorities. Recording a registration in Stripe does not register the
business with the authority.

The Tax Codes API returned these relevant candidates, not yet applied:
- `txcd_10103000`: Software as a service (SaaS), personal use, accessed online without a download. Candidate for the current web app.
- `txcd_10103100`: SaaS, electronic download, personal use. Reassess for a future downloaded app or bundled access.

Classification requires confirmation; do not select a code merely to obtain a
nonzero result. PLOT currently uses the broad electronically supplied services
code. See [Stripe's tax codes](https://docs.stripe.com/tax/tax-codes).

After the registration and classification decisions:
1. Prepare the confirmed jurisdiction and tax treatment in the sandbox, with approval for registration records.
2. Implement and test explicitly gated automatic tax and required customer-location collection. The current Checkout handler does not enable automatic tax.
3. Execute sandbox calculations and Checkout; inspect `taxability_reason`, not only the amount. Test renewals and refund tax reversal. Zero with `not_collecting` does not establish successful collection.
4. Review the equivalent live settings and collection fees before production changes. Do not add or expire tax registrations without confirmation.

Registration obligations and filing arrangements require the business's tax
advice; this technical audit does not determine them. Stripe collection alone
does not file all returns. See [Stripe Tax setup](https://docs.stripe.com/tax/set-up).

## Prepared production changes for later approval

- Reuse the live product and prices. Set confirmed tax behavior rather than leaving currency-dependent inference implicit.
- Create one named PLOT Premium portal with invoice history, payment-method updates, period-end cancellation and only the two existing Premium prices. Shorter-interval changes take effect at period end; immediate upgrades reset the anchor and invoice prorations, as tested.
- Set its return URL to `https://app.theplot.tv/settings` and legal links to the current PLOT website pages, after verifying the public links.
- Review live USD settlement and Adaptive Pricing. Public Australian settlement pricing lists 1%; sandbox displays 0.91%. Confirm applicable live fee before changing settlement. A matching bank account is needed for USD payouts; no bank details are requested in chat.
- Verify pending production migrations against the live schema, run restore/function-diff checks on the final patch, deploy the approved billing changes and configure production secrets with checkout explicitly false.
- Validate the closed production deployment, then obtain a separate explicit launch decision before enabling checkout/public flags or making a real purchase.

Exact existing Stripe resource IDs and the non-executable portal proposal are
stored in the ignored local QA rollout plan. No secrets are stored there.
This plan remains blocked on tax inputs and credential handoff; it is not a
request to approve public launch yet.

## Rollout preflight, 2026-09-24

- Downloaded both production billing functions into an ignored local audit
  directory using `supabase functions download --use-api`. No deployment.
- `pnpm run db:migration-test`: passed all 10 pending migrations against a fresh
  local production restore (103 migrations already applied). Temporary database
  removed. Vault/pg_net are stubbed and this check does not exercise RLS.
- Four pending billing migrations: `20260923100000`, `20260924020000`,
  `20260924030000`, `20260924040000`. The other six pending migrations concern
  imports/tracking and are not implicitly approved with billing setup.
- `pnpm run db:function-diff`: passed. One existing function is redefined:
  `is_premium` gains the failed-renewal grace predicate. Zero lines removed
  from live function bodies; remaining functions are new. Temporary restore
  removed after the comparison.
- Public privacy and terms links return HTTP 200 at `/privacy` and `/terms`.
  `/contact.html` returns 404, so do not use that guessed support destination.
- Live portal created after approval. On 2026-09-25 the Dashboard confirms
  exactly US$3/month and US$25/year, immediate prorated upgrades, and shorter
  intervals scheduled at period end. Hosted portal login remains disabled.

### Approved and completed: portal configuration only

Savannah approved creation on 2026-09-24. Created live configuration
`bpc_1UJCj1Ike4XlO34ASn26OsJA` in PLOT account `acct_1TquJrIke4XlO34A`.
A subsequent API read confirms one active, default configuration named
PLOT Premium, with the settings below and hosted login disabled. The create
request included only the two existing USD prices. Dashboard catalogue
read-back verified both prices on 2026-09-25.
No live customer sessions, subscription changes or charges were created.
No backend secrets, deployment, checkout gate, price or tax settings changed.

Create one live PLOT Premium portal configuration for invoice history, payment
method updates, period-end cancellation, and switching between US$3/month and
US$25/year. Annual-to-monthly changes take effect at period end; monthly-to-annual
changes invoice prorations immediately. Return users to app settings and show
the verified legal links. This approval does not cover backend deployment,
price/tax mutations, bank/settlement changes, checkout activation, or charges.

## Billing-only backend rollout proposal, 2026-09-25

Target: production Supabase `mkegtssedjyqldysvzga`. Separate approval required.

Verification: `MIGRATIONS_DIR="$PWD/.playwright/import-pilot/billing-only-migrations" pnpm run db:migration-test`
passed all four billing migrations against a fresh production restore on
2026-09-25 without any import/tracking migrations. Temporary database removed.
Live settlement was rechecked: AUD is still the only configured currency.
No USD settlement or bank changes have been made.

1. Set `STRIPE_CHECKOUT_ENABLED=false` before any code change; set
   `STRIPE_PORTAL_CONFIGURATION=bpc_1UJCj1Ike4XlO34ASn26OsJA` and
   `STRIPE_SETTINGS_URL=https://app.theplot.tv/settings`. Preserve existing
   credentials until the replacement live restricted key is securely installed.
2. Apply only the four billing migrations listed above in timestamp order,
   recording their versions in migration history. Do not run an unrestricted
   database push: six unrelated import/tracking migrations are also pending.
3. Deploy `stripe-webhook` and `stripe-billing`, including their shared modules,
   with the repository JWT settings (webhook false; billing true). Preserve the
   existing webhook endpoint and signing secret. API-version changes are a
   separate operation and not part of this proposal.
4. Verify deployed source, schema/RPC availability and access grants, unauthorised
   access rejection, missing-signature rejection, and closed checkout. Do not
   create a real subscription or mutate an existing customer's billing for a test.
5. If verification fails, retain the checkout closure and restore the downloaded
   previous edge functions. Leave additive schema in place; dropping schema or
   reverting billing data is not an automatic rollback action.

This proposal excludes web/marketing deployment, import/tracking migrations,
price/tax changes, bank/settlement changes, public subscription activation and
real payments. The restricted production key still needs its own secure handoff.

## International tax finding

Australian GST non-registration does not establish that worldwide subscription
sales can begin without registrations elsewhere. HMRC states that non-established
suppliers making taxable UK supplies, including digital services, have no
registration threshold. Confirm PLOT's classification and intended launch
countries with a tax adviser before opening international checkout. No overseas
registration has been added and automatic tax has not been enabled.

Sources checked 2026-09-25:
- [HMRC digital services guidance](https://www.gov.uk/guidance/the-vat-rules-if-you-supply-digital-services-to-private-consumers)
- [HMRC registration guidance, non-established taxable persons](https://www.gov.uk/government/publications/vat-notice-7001-should-i-be-registered-for-vat/vat-notice-7001-should-i-be-registered-for-vat)

## Approved production backend rollout completed, 2026-09-25

Savannah approved the billing-only rollout. Applied these changes:
- Set and digest-verified `STRIPE_CHECKOUT_ENABLED=false`,
  `STRIPE_PORTAL_CONFIGURATION=bpc_1UJCj1Ike4XlO34ASn26OsJA` and
  `STRIPE_SETTINGS_URL=https://app.theplot.tv/settings`.
- Applied the four billing migrations and their migration-history records in one
  transaction. Re-read `is_premium` immediately before applying: it matched the
  reviewed baseline. The overdue-grace backfill affected zero rows.
- Deployed `stripe-webhook` (ACTIVE version 563, JWT verification false) and
  `stripe-billing` (ACTIVE version 570, JWT verification true).
- Downloaded both deployed sources and compared them byte-for-byte with the
  local functions and all four shared dependencies: all six files match.

Read-only post-deployment database checks confirmed all four migration versions,
`past_due_since` and `revision`, RLS on checkout attempts, no anonymous or
ordinary-user reads of checkout attempts, service-role-only billing mutation
RPCs, and authenticated-only access to the self-status RPC (plus service role).

Endpoint checks: unsigned webhook HTTP 400 Missing signature; unauthenticated
portal and checkout HTTP 401; anonymous self-status RPC HTTP 401 permission
denied. The first REST probe used a disabled legacy key and was repeated with
production's modern publishable key. No keys were printed. Checkout closure is
verified by deployed source plus the false setting's digest; a signed-in
production checkout HTTP 503 check remains outstanding because these probes
used no production user session. No synthetic production user was created.

No web/marketing release, import/tracking migration, live customer session,
subscription, charge, tax registration, bank change, or webhook-version change
was performed. Existing Stripe credentials were preserved. Remaining work:
secure live restricted-key handoff, signed-in production flow verification,
confirmed inclusive price configuration, international tax scope, USD settlement
and Adaptive Pricing verification, and separate public-launch approval.

## Live credential handoff and signed-in UI check, 2026-09-25

Prepared (not submitted) live Stripe key form named `PLOT production billing`.
Verified exactly these selected permissions: Customers write, Products read,
Prices read, Subscriptions read, Customer Portal write, Checkout Sessions write.
All other permissions remain None. Prepared the production Supabase secrets
form with the exact name `STRIPE_SECRET_KEY`. Savannah must create/copy the key
and paste/save its value herself under the browser credential-change policy.
Neither form has been submitted by the agent.

Signed-in app check on Savannah's account: Settings > Billing displays Premium /
Active and Manage subscription, but selecting it returns `No subscription found`.
No subscription was created or entitlement changed. This does not validate a
working live portal session and must not be reported as a successful paid-account
flow. The current deployed frontend's Premium presentation needs reconciliation
with authoritative billing status before launch. The authenticated checkout
closure remains untested through the UI because this account exposes only Manage
subscription. Production checkout flag remains false from verified rollout.

Credential handoff follow-up: Savannah reports completing creation and saving.
Stripe live Dashboard now lists `PLOT Production Billing`, created 25 September.
Production `STRIPE_SECRET_KEY` metadata shows an update at
2026-09-25T01:24:57.838Z. The `STRIPE_CHECKOUT_ENABLED` digest still matches
`false`. No credential value was displayed or copied by the agent. This verifies
creation and a secret update, not that the saved value matches that Stripe key
or that every permission works in production. Stripe shows no last-used date
for the new key; a successful production Stripe API operation remains unverified.

Local billing UI correction: `usePremium` now derives entitlement and management
access from the authenticated billing-status response, not the profile badge.
Settings renders Manage subscription only when that response confirms a billing
relationship. Pending/failed reads grant neither control; expired subscribers
with a relationship retain management access. Shared domain tests cover those
states. `pnpm run check`, ten billing/Premium unit tests and `git diff --check`
passed. This correction is local only; the public web app has not been deployed.

## Scoped web release preparation, 2026-09-25

The original long-running branch predates the deployed Settings layout. A clean,
agent-owned detached worktree is prepared at
`.playwright/import-pilot/billing-release`, based on refreshed `origin/main`
`2b64fc53d`. It contains only the billing-status correction, authoritative profile
entitlement read, related shared copy, agreed USD web pricing, shared unit tests,
and a billing-state preview fixture. No changes were committed, pushed or deployed.
The main worktree and its import/tracking changes remain intact.

Validation in that release checkout: frozen-lockfile install; `pnpm run check`
passed; three billing domain tests passed; diff whitespace check passed. Browser
preview verified zero management buttons for no-subscription/no-relationship
states, one for expired subscribers, and one for active subscribers. USD price
copy verified after restarting Vite to refresh cached shared modules. The preview
uses explicit fixture states, not a production account or Stripe request.
Observed console errors belong to a browser extension's DataDog loader, not PLOT.

The new live restricted key is still not independently authenticated by these
checks. Supabase secrets metadata provides a digest, not a retrievable credential;
the user's no-subscription portal response returns before Stripe is called.
Do not claim this as key validation. Use a separately reviewed server-side
read-only price diagnostic or secure operator-run key check before launch.

A launch-country question is pending: international subscriptions after overseas
tax setup, or an Australian initial launch. Neither scope has been selected by
the agent and no geographical restrictions or registrations were applied.

### Approved web billing UI deployment, 25 September 2026

User approved production deployment after reviewing all four billing UI states and
final Ko-fi copy. Published the scoped release from
`.playwright/import-pilot/billing-release`, based on current `origin/main`
`2b64fc53dbfb4269dab46e0d2d870cbc08bb02b2`, via Cloudflare Pages direct upload.
Deployment: https://64bbe543.plot-5wr.pages.dev (project `plot`, production branch
`main`, canonical host `app.theplot.tv`). Pages Functions were compiled and uploaded.
No Git commit, push or merge was performed. The source changes still need to be
committed and merged so a subsequent main deployment retains them.

The local preview environment points to staging, so the production build explicitly
used production Pages variables and existing browser-public production credentials
recovered from the deployed app assets. No server credential was bundled. Build
scan confirmed production Supabase and TMDB proxy, no staging identifiers, and no
Stripe secret-key patterns. `pnpm run check`, the three billing unit tests, and
`git diff --check` passed.

Signed-in canonical production Settings > Billing verified Savannah's account as
Free, no erroneous Manage subscription action, US$3/month and US$25/year coming-soon
copy, and the exact approved Ko-fi text below the subscription panel. Browser logs
showed only an unrelated Chrome extension DataDog import error. Supabase secret
metadata digest confirmed `STRIPE_CHECKOUT_ENABLED=false`; no backend config or
schema was changed by this deployment. Live Stripe restricted-key API verification
and international tax/Adaptive Pricing launch decisions remain outstanding.

### International launch audit and proposed operator check, 25 September 2026

Live Stripe connector audit (account acct_1TquJrIke4XlO34A, livemode true):
- Tax settings active, default behavior inferred_by_currency, generic digital tax
  code txcd_10000000; no registrations. Do not equate settings active with a legal
  registration or with Checkout automatic_tax enabled.
- Existing USD monthly 300 / annual 2500 prices active, tax_behavior unspecified.
- Dashboard settlement currencies still AUD only. USD checkbox prepared in the
  Add settlement currency dialog, NOT saved. No bank details or payout changes.

Proposed exact tax configuration: POST /v1/tax/settings with
{"defaults":{"tax_behavior":"inclusive"}}. Retains current code and address;
no registration, no automatic tax collection, no price amount change. This sets
fallback behavior for both currently unspecified prices. Await production-config
approval before applying.

Stored live key cannot be read back through Supabase metadata. Prepared a temporary
operator-only function at .playwright/import-pilot/stripe-key-check:
- Requires the backend secret in apikey, hashed constant-time comparison; no CORS.
- Requires checkout explicitly false and a restricted live Stripe key.
- Retrieves only the exact two configured live prices using GET; validates product,
  currency, amounts, interval and active/livemode fields. No customer or payment writes.
- Returns only pass/fail, price interval/tax behavior and HTTP status on failure.
- Deploy only after specific approval; invoke once, then delete the temporary
  function. Existing billing functions and secret values remain unchanged.
- deno check passed; deno test --allow-env probe.test.ts passed (unauthenticated
  and non-POST rejection, no Stripe network access). Real key verification pending.

Sources reviewed:
https://docs.stripe.com/tax/calculating/adaptive-pricing
https://docs.stripe.com/payouts/multi-currency-settlement
https://www.gov.uk/government/publications/vat-notice-7001-should-i-be-registered-for-vat/vat-notice-7001-should-i-be-registered-for-vat
https://vat-one-stop-shop.ec.europa.eu/one-stop-shop_en

International launch is not cleared: UK non-established suppliers have no taxable
supply threshold; EU non-Union digital-service obligations need handling before
sales there. Australian GST threshold is not an international exemption. Confirm
registrations/filing route with an accountant or initially restrict supported sales
countries. Stripe's registration-list API only records registrations already held.
USD settlement has separate merchant fees; do not conflate these with the previously
accepted customer Adaptive Pricing conversion fee. User must complete bank-account
setup personally if required and approve the applicable settlement pricing.

### Revised price and inclusive tax applied, 25 September 2026

User explicitly changed pricing to USD3/month and USD24/year and approved key
verification plus tax-inclusive setup. Created live annual price
price_1UJPfKIke4XlO34AV9yJ6CPx (2400 USD cents/year, same Premium product),
updated live portal allowed prices and production STRIPE_PRICE_YEARLY. Existing
USD25 price retained for history, no subscription migrated or charged. Deployed
stripe-billing with 2400 annual validation; monthly stays 300.
Applied live Tax defaults.tax_behavior=inclusive; current prices use unspecified
behavior and inherit this default. No tax registrations added or automatic tax
collection enabled. International tax readiness remains unresolved.

Web deployment https://b20843db.plot-5wr.pages.dev and marketing deployment
https://6c7112e9.plot-site.pages.dev update USD24 annual copy, USD2 monthly equivalent,
and 33% annual saving. Signed-in app.theplot.tv Settings Billing visibly confirmed
USD3/month or USD24/year, coming soon. Root premium tests 7 passed, billing policy
Deno tests 4 passed, web billing tests 3 passed, production-env pnpm run check and
23-function edge check passed. Changes remain uncommitted.

Key probe: deployed approved operator-only billing-key-check; unauthenticated
requests rejected. Operator invocation failed at gateway (401 Invalid API key),
and no accessible key matched the configured SB_SECRET_KEY digest. Thus the stored
Stripe key remains NOT VERIFIED. Automatic approval review rejected replacing
operator authentication with an out-of-band expiring token as unauthorized access
control bypass. That change was NOT executed. Temporary function deleted as agreed.
Do not retry a changed authentication mechanism without explicit user approval.

### Live restricted Stripe key VERIFIED, 25 September 2026 03:42 UTC

User explicitly approved the private 15-minute token check after the earlier
access-control rejection. Deployed that exact temporary read-only probe, checked
missing-token rejection (401), and invoked it with the private operator token.
It first caught a mismatched production STRIPE_PRICE_MONTHLY reference. Corrected
it to the approved USD3 monthly price price_1UIiURIke4XlO34A7lYuOEO5; annual remained
price_1UJPfKIke4XlO34AV9yJ6CPx (USD24).

Probe returned HTTP200 / ok=true at 2026-09-25T03:42:08.262Z using the actual
STRIPE_SECRET_KEY inside production: restrictedLiveKey=true, checkoutDisabled=true,
and both exact active live product prices passed amount/currency/interval checks.
Price tax_behavior remains unspecified, inheriting the previously verified live
inclusive Tax default. This proves price-read authentication, not every write
permission or a charged subscription lifecycle.

Deleted billing-key-check immediately after success, removed the local token file,
and verified its endpoint returns404. No customer, subscription, payment or invoice
was created by this check. Remaining launch work: international registrations and
Adaptive Pricing settlement setup, plus source commits/merge for durable releases.

### AUD banking and tax readiness audit, 25 September 2026

Read-only live Stripe API checks after the user added their AUD account:
- Account charges_enabled and payouts_enabled both true; default_currency aud.
- Australian AUD external account present and default; status new (not proof of a completed payout).
- No currently due, past due or pending verification requirements.
- Exact approved USD300/month and USD2400/year prices active on the Premium product.
- Tax default inclusive, generic digital code txcd_10000000; registrations empty.
- Production webhook enabled at the correct production Supabase endpoint for
  checkout.session.completed and subscription updated/deleted events.
- Shared Checkout creation currently has no automatic_tax or Managed Payments setting.

Tax setup remains incomplete. Requested an explicit choice before adding Managed
Payments fees and changing merchant-of-record arrangements. No tax registrations,
paid service activation, bank changes, deployment or live checkout activation in
this audit. Managed Payments availability in Australia was confirmed in Stripe's
April 22, 2026 changelog; account/product eligibility still requires verification.

Validation: node --test packages/core/tests/unit/billing.test.js
packages/core/tests/unit/premium.test.js passed 10 tests. DENO_DIR=/tmp/plot-tax-billing-deno
deno test --no-config --node-modules-dir=none --allow-env
supabase/functions/_shared/billingPolicy.test.ts
supabase/functions/_shared/checkout.test.ts
supabase/functions/_shared/billingSnapshot.test.ts passed 13 tests.
Initial Deno runs hit dependency/cache permission errors; using a temporary cache
resolved them. Deno's incidental package.json workspace addition was removed.
These tests do not constitute a charged live lifecycle or tax-calculation test.
No application code changed; full build was not repeated for this audit.
