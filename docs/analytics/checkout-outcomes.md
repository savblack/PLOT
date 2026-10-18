# Premium checkout outcomes

Checkout abandonment is a reporting signal. A checkout error is a reliability signal. The Revenue and Monetization dashboard keeps them separate, and one unfinished checkout no longer sends Savannah an email.

## Definitions

| Event | Meaning | Key properties |
| --- | --- | --- |
| `premium_checkout_started` | Stripe returned a real subscription Checkout session. This proves a payment link was prepared, not that the hosted page rendered. | `checkout_session_id`, `checkout_created_at`, `checkout_expires_at`, `livemode`, existing plan/price/currency properties |
| `premium_checkout_completed` | A signed `checkout.session.completed` or `checkout.session.async_payment_succeeded` reports `paid` or `no_payment_required`. Includes a trial that requires no initial payment. | Session properties plus `payment_status` |
| `premium_checkout_cancelled` | A signed `checkout.session.expired` reports an unfinished subscription session. The historical event name is retained; the dashboard labels it expired. | Session properties, `reason: session_expired` |
| `premium_checkout_superseded` | An expired session marked `plot_expiry_reason: superseded` before Plot replaced its link. Excluded from abandonment. | Session properties, `reason: session_replaced` |
| `premium_checkout_failed` | Preparing checkout failed, or a delayed checkout payment failed. Validation and an already-pending checkout remain distinct from technical errors. | `reason`, `livemode`, `stage` (`validation`, `pending`, `creation`, `payment`); session properties for delayed failures |
| `premium_payment_failed` | A signed `invoice.payment_failed` for a mapped subscription. | `phase` (`initial`, `renewal`, `other`), invoice/subscription IDs, `attempt_count`, `livemode` |

Closing the browser or pressing Back does not immediately expire a Stripe session. It can still be resumed. Plot marks sessions as superseded before expiring them for a plan or configuration change. These produce a separate replaced-session event and are excluded from abandonment. If the marker cannot be saved, the old link stays usable and replacement stops. An ordinary expiry is still not proof that a person lost interest. Someone can have an expired session and later complete another one. If expiration fails and Stripe confirms the link remains open, Plot clears the replacement marker. If even that reconciliation fails, the marker means replacement intent and the server logs a warning; it may undercount a later natural expiry. Manually expired links outside this flow have no replacement marker and remain in the expiry count.

The session chart counts distinct `checkout_session_id` values on each event's day. Retrying a returned checkout URL does not add a new session. It is a flow chart, not a cohort conversion rate: do not divide today's completions by today's starts, because sessions can complete on a different day. The existing 14-day person funnel is kept for historical conversion reporting; it is not used as an abandonment alert.

`premium_converted` is unchanged for compatibility. Its existing subscription snapshot capture is separate from the new explicit session completion signal. Neither a trial-start event nor a price amount proves collected revenue. Use Stripe for accounting.

## PostHog configuration

Project: PLOT (`471234`), timezone Australia/Sydney. Updated October 18, 2026 under Savannah's approval in the checkout tracking chat.

Dashboard: [Revenue and Monetization](https://us.posthog.com/project/471234/dashboard/2203520).

- [Checkout sessions: prepared, completed, expired](https://us.posthog.com/project/471234/insights/YTjOnKAZ), ID `12991902`.
- [Checkout errors: people affected daily](https://us.posthog.com/project/471234/insights/QPyLx2qD), ID `12991903`.
- [Subscription payment failures by phase](https://us.posthog.com/project/471234/insights/itN5L5Wx), ID `12991913`.
- Disabled old alert `01a0ddf2-0f01-0000-5f9f-d5fcd290051f` on `wrUVOkuf`. Previous settings: enabled, daily, overall funnel conversion below 100%.
- Replacement alert `01a14dae-b7a3-0000-aac9-88127d879f03`: enabled, hourly, first series of `QPyLx2qD`, upper bound 2 (fires at 3+ distinct people per calendar day), ongoing interval included, recipient user `592990`. Allowed failure reasons: `billing_not_configured`, `price_mismatch`, `stripe_error`, `billing_account_unavailable`, `async_payment_failed`. Validation and checkout-pending responses are excluded. Repeated clicks by one person do not meet the threshold.
- All three new insights apply PostHog's internal/test account filter and require `livemode: true`. No browser bot cohort is required for these authenticated server events.
- No conversion-drop alert yet: there is only one historical checkout starter and no defensible baseline. Retune after real volume establishes a baseline.

Session IDs and the new completion/payment events begin with this deployment. Old events lack the session ID and do not appear in the new session chart; the old charts are preserved. Empty new charts before rollout are not evidence of healthy payments. No events are backfilled or invented.

## Delivery and rollout

Event UUIDs are deterministic per event name and source session or Stripe event. Session-start timestamps use Stripe's original creation time; webhook timestamps use the Stripe event time. A reused session or redelivered webhook therefore has the same UUID and timestamp. PostHog eventually deduplicates matching UUID/name/person/time, and the session chart also counts distinct session IDs. See [PostHog deduplication](https://posthog.com/docs/cdp/troubleshooting).

Capture remains best-effort: an analytics outage is logged and does not change checkout or entitlement behavior. This is not a durable accounting ledger or a guaranteed delivery queue. The expiry path no longer writes a database receipt solely to deduplicate analytics; duplicate delivery is handled by UUID and session counting instead.

Before calling the rollout complete:

1. Get Savannah's approval to merge/deploy `stripe-billing` and `stripe-webhook`. No schema change, checkout gate, price, trial, or entitlement change is included. Replacing a link first writes its expiry reason to Stripe session metadata.
2. Deploy the reviewed functions with existing `supabase/config.toml` settings preserved.
3. Add `checkout.session.async_payment_failed` to existing live endpoint `we_1TwiYmIke4XlO34AB2XkHNVb`, preserving all ten existing events. The live endpoint was read on October 18 and already receives completed, async succeeded, expired, subscription lifecycle, trial reminder, and invoice payment events. No live Stripe configuration was changed during implementation.
4. Use a dedicated sandbox to verify signed completed/trial, expired, delayed payment, and invoice failure payloads. Do not replay live billing writes or create a real charge for a test. Inspect event IDs/session IDs and confirm repeated delivery does not increase distinct session counts. Check both initial and renewal failure classification.
5. Confirm the deployed integration/guard result and first genuine live telemetry. Local typechecks do not prove Supabase's bundler deployed successfully.

The PostHog charts and replacement alert are already saved. New server telemetry remains pending code deployment. Notification delivery was not force-tested because that would send an email.
