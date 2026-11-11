# What watches Plot

Each watcher runs on Cloudflare's cron, which fires on time, unlike GitHub's
schedule. Every watcher emails `sav.black@outlook.com` once when something
breaks, sends a reminder every few hours while it lasts, and emails again when
it recovers.

| Watcher | Every | Checks | Lives in |
|---|---|---|---|
| uptime-watch | 5 min | app.theplot.tv serves the app shell. The TMDB proxy returns trending titles. Edge functions answer (`billing-availability`). Stripe is delivering billing events to `stripe-webhook` (see below). | `apps/web/workers/uptime-watch` |
| whats-on-watch | 30 min | theplot.tv/whats-on shows articles | `apps/web/workers/whats-on-watch` |
| backup-heartbeat | daily | Last night's database backup and the weekly storage mirror landed in R2 | `apps/web/workers/backup-heartbeat` |

GitHub-side watchers raise issues rather than email:

- `supabase-deploy-guard.yml` raises an issue when production misses main's migrations or function deploys.
- `whats-on-health.yml` is a backup for whats-on-watch.
- `db-write-paths`, `migration-drift`, `netflix-top10`, `streaming-top10` and
  `broadcast-guide` each open an `incident` issue when they fail, comment on it
  if they fail again, and close it on the next success. The first failure also
  emails through `.github/scripts/marketing-alert.sh`. Their CircleCI twins
  email only. See `.github/scripts/job-incident.sh`.
- `staging-tests.yml` opens an `incident` issue when the nightly Staging SQL
  tests fail, and closes it on the next pass.

uptime-watch also opens a GitHub issue labelled `incident` when its
`GITHUB_TOKEN` secret is set, and closes the issue on recovery.

### Stripe webhook deliveries

When Stripe can't deliver a billing event, or `stripe-webhook` answers it with
an error (a bad signature, a failed write), the member's payment, renewal or
cancellation never reaches their Premium status. uptime-watch asks Stripe every
5 minutes for two things: is the endpoint that sends to `stripe-webhook` still
enabled, and has any event gone undelivered for 15 minutes or more
(`GET /v1/events?delivery_success=false`). Either one sends the email, with
the subject "Stripe payment updates are not reaching Plot", and opens the
`incident` issue. This alarm is separate from the app checks, so a Stripe
problem never hides a new app outage. It clears once Stripe has delivered every
event, by its own retry (live Stripe retries for 3 days) or by a resend from
the Stripe dashboard. Stripe's docs don't say that a resend clears the
"not delivered" flag, and nobody has tested it yet. So the check looks back
only 15 days, the longest Stripe allows a resend, and an alarm can never
outlast that.

The "not delivered" count covers every webhook endpoint on the Stripe account,
not just Plot's. On 2026-11-11 live had only Plot's. If another is added, the
alert says so, and you check in Stripe which endpoint failed.

The check is off until uptime-watch has a `STRIPE_READ_KEY` secret: a
restricted live key with Read on Events and Webhook Endpoints and nothing
else. Make it in Stripe under Developers, API keys, Create restricted key.

Not covered here: an event Plot accepts but can't match to a member
(`no user for customer`). The handler answers 200 so Stripe doesn't retry
forever, and reports it to PostHog as an error log instead.

## App errors (PostHog alert)

One watcher lives in PostHog, not in this repo: the alert **App errors affect
3+ people in a day** on the insight **App errors: people affected daily**
(`x5mggkz6`, https://us.posthog.com/project/471234/insights/x5mggkz6), in the
PostHog project Plot. It emails `sav.black@outlook.com`. It does not open a
GitHub issue.

- **Counts:** distinct people per day with any `$exception` (a crash the app
  reported, web or mobile, see `docs/analytics/README.md` "Error tracking"),
  `action_failed` (a save, edit or delete that failed) or `load_failed` (a
  library read that failed). Test accounts are filtered out.
- **Fires:** when that count reaches 3 in one day. PostHog checks hourly and
  counts the day so far, so the email arrives within about an hour of the third
  person.
- **Why people, not events:** one person on a bad connection produces a burst.
  On 2026-10-11 one person sent 8 `Failed to fetch` exceptions in a minute, and
  on 2026-11-10 one person sent 11 events in one session. Counting events would
  page on each of those.
- **Why 3:** over the 60 days to 2026-11-11 the daily count was 0 on most days,
  1 on eight days and 2 on one, with one day at 4. That day, 2026-10-16, was a
  real bug: four mobile users could not read or write secure storage
  (`setValueWithKeyAsync` / `getValueWithKeyAsync`). A bar of 3 would have
  fired on that day only. Raise it as the user base grows, so it keeps sitting
  above a normal day.
- **Known noise:** four visitors to theplot.tv (2026-10-23, 10-26, 10-30,
  11-10), one per day, hit `window.ethereum.selectedAddress = undefined`. Plot's
  code never mentions `window.ethereum`, which is what crypto-wallet browser
  add-ons put on every page, so this is most likely such an add-on (which one is
  unconfirmed). It counts toward the 3. At current traffic it is unlikely to
  reach 3 on its own, but three such visitors on one day would fire the alert.
  If that happens, filter that message out of the insight.
- **Proven:** on 2026-11-11 the bar was set to 1 person, the alert fired and
  emailed, and the bar went back to 3.

To change it, edit the alert from the insight's Alerts button in PostHog, then
update this section.

## Not watched yet

- A signed-in read and write (the shape of the July 2026 outage). Needs a dedicated Staging test account.
- pg_cron job failures.

## Deploying or changing a watcher

The deploy steps are in each Worker's `wrangler.toml` header. Run the unit tests with `pnpm run test:workers`.
