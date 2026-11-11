# stripe-webhook-watch

Status: active
Branch: agent/2026-11-11-stripe-webhook-watch
Worktree: ~/Developer/PLOT-worktrees/2026-11-11-stripe-webhook-watch
Owner: Jacob (reliability). Started by the monitoring-plan session (local_15079aa4).
Updated: 2026-11-11

## Plain English

Plot now checks with Stripe every 5 minutes that payment updates are reaching
it. If Stripe can't deliver one, or Plot turns one away, Savannah gets an email
and a GitHub `incident` issue, and a second email when it is fixed. It stays
off until Savannah makes a read-only Stripe key and adds it to the uptime
watcher (steps below).

## Done

- `apps/web/workers/uptime-watch/src/index.js`: new `stripe` check (endpoint
  enabled + `GET /v1/events?delivery_success=false&created[lte]=now-15m`),
  Stripe-specific down/recovered email copy, failing check names kept in state.
- `apps/web/workers/uptime-watch/test/stripe.test.mjs`: classifier cases plus an
  end-to-end run through the Worker (stubbed Stripe/Resend/GitHub).
- `wrangler.toml`: `STRIPE_READ_KEY` secret, `STRIPE_GRACE_MINUTES` var.
- `docs/ops/monitoring.md`: Stripe moved to watched.
- Live Stripe account (PLOT, read-only via connector): one endpoint
  `we_1TwiYm...` enabled, pointing at production stripe-webhook; zero
  undelivered events in the last 30 days, so enabling will not false-alarm.

## Why this signal

Stripe's own failing-endpoint email comes after days and opens no issue; a
heartbeat column false-alarms on quiet days. `delivery_success=false` is
Stripe's own record of the exact failure.

## Not proven / needs Savannah

- Not proven in Stripe test mode: the connector only reaches live mode, `.env`
  has no Stripe key, and there's no Stripe CLI here. Proof so far is the unit
  tests plus running the classifier on the real live endpoint JSON.
- To switch on: Stripe dashboard, Developers, API keys, Create restricted key
  with Read on Events and Webhook Endpoints only, then
  `cd apps/web/workers/uptime-watch && npx wrangler secret put STRIPE_READ_KEY && npx wrangler deploy`.
  Optional test-mode proof: same with a test-mode restricted key and `STRIPE_WEBHOOK_URL`
  pointed at a test endpoint that returns 500, then curl the manual endpoint.

## Checks

- `pnpm run test:workers`: 68/68 pass.
- `pnpm run check`: exit 0 (only pre-existing mobile `no-explicit-any` warnings).
- Second-agent diff read: done. Fixed: Stripe moved to its own state key
  (`stripe-state`) so a standing Stripe alarm can't swallow a new app outage;
  reason notes other endpoints on the account; enabled endpoint preferred over
  a disabled duplicate URL; 15-day lookback; entities decoded in issue bodies.
- Unverified: whether a dashboard resend clears `delivery_success=false`
  (Stripe docs silent). The 15-day lookback bounds it either way.

## Next

PR open (see branch). Do not merge without Savannah. Delete this file
in the last commit before merge. Expect a one-line conflict in
`docs/ops/monitoring.md` "Not watched yet" with the sibling monitoring PRs.
