# What watches Plot

Each watcher runs on Cloudflare's cron, which fires on time, unlike GitHub's
schedule. Every watcher emails `sav.black@outlook.com` once when something
breaks, sends a reminder every few hours while it lasts, and emails again when
it recovers.

| Watcher | Every | Checks | Lives in |
|---|---|---|---|
| uptime-watch | 5 min | app.theplot.tv serves the app shell. The TMDB proxy returns trending titles. Edge functions answer (`billing-availability`). Stripe is delivering billing events to `stripe-webhook` (see below). | `apps/web/workers/uptime-watch` |
| uptime-watch, signed-in check | hourly | A test account on PLOT Staging, and one on production, signs in, reads its own profile and History, saves a watched title the way the app does, and deletes it. Catches the July 2026 shape: pages load but saving fails. | `apps/web/workers/uptime-watch/src/signin.js` |
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
- `cron-health.yml` checks the database's own scheduled jobs (pg_cron) every
  hour. It opens an `incident` issue and emails when a job's last run failed,
  or when an active job has gone more than twice its schedule plus 10 minutes
  without running (a job pg_cron stopped starting, or a run stuck for that
  long). It closes the issue on the next healthy run. It reads
  `public.cron_job_health()` as the read-only `plot_ci_readonly` role and never
  sees pg_cron's error text; for that, query `cron.job_run_details` as the
  owner. Run it by hand with `SUPABASE_DB_URL=… pnpm run db:cron-health`. A new
  job that hasn't run yet is listed as waiting, not stopped: the check finds the
  migration that scheduled it and gives it twice its schedule from when that
  migration landed on main (git history). A job made by hand, outside a
  migration, has no such date and can show as stopped until its first run.

- The same workflow's second job checks what pg_cron can't see: whether the
  edge function a job calls actually worked. Most jobs (send-push,
  alert-email-delivery, the import worker, Brevo sync, the sitemap refresh and
  others), and the database webhooks on feedback, reports and profile changes,
  hand their work to an edge function through pg_net. pg_cron counts the job as
  passed once the request is queued, so a function that answers 404 (not
  deployed), 500, times out or never answers looked healthy. See
  [pg_net calls](#pg_net-calls-to-edge-functions) below.

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

### The signed-in check

It signs in as `plot-signin-watch@example.invalid`, an account on PLOT Staging
that exists only for this check. Its password is in the Mac's Keychain
(`com.theplot.staging.signin-watch.password`) and in the Worker's
`SIGNIN_PASSWORD` secret, never in the repo. Each run writes one History row
marked `plot-signin-watch` in its note and deletes it again; a row left by an
interrupted run is cleaned up by the next one. The title comes from the TMDB
proxy's trending list, so no TMDB id is hardcoded.

The same check runs against production, as an account of the same name in
production. Production sign-in requires a Turnstile captcha, which a Worker
can't solve, so that account has no password. The Worker renews a stored
session instead (a refresh needs no captcha) and saves the renewed one in its
`STATE` namespace under `signin-prod-session` before doing anything else.
`scripts/signin-watch-seed.mjs` makes the first session from a one-time magic
link, and makes a new one if the chain ever breaks. Both checks refuse to read
or write if the session belongs to any other account.

Each has its own emails ("saving to History is failing on Staging" or "in
production") and its own stored state, separate from each other and from the
uptime checks. A lost production session is "can't run", not "failing": it
sends the can't-run email after 12 hours, which says to re-run the seed script.

What the production account costs: creating it sent one "new signup" email
and added it to Brevo's app-users list. Each hourly save marks it for Brevo's
attribute sync, about 24 small Brevo updates a day. Brevo's lifecycle emails
skip it because it never finishes onboarding. Its profile is private, so the
brief feed post each save creates is seen by nobody.

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

### pg_net calls to edge functions

pg_net keeps each answer for only 6 hours and doesn't record which function it
came from, so two triggers on pg_net's own tables copy the function name and
the answer's status into `public.pg_net_calls` (no headers, bodies or answer
text; kept 8 days, purged daily by the `pg-net-calls-purge` job). The hourly
`http` job in `cron-health.yml` reads `public.pg_net_call_health()` as
`plot_ci_readonly`: one row per function, with its latest outcome.

- **Failed** means anything but a 2xx in time: another status, a timeout, a
  connection error, or no answer at all after 15 minutes.
- **Alerts** when a function's latest call failed and either the one before
  failed too, or it was called fewer than 4 times in the last day. So a daily
  or weekly job alerts on its first failed run, while a busy webhook (every
  profile save calls `profiles-changed`) doesn't page for one timeout that the
  next call recovers from. It also alerts when a function fails on and off: 5
  or more failed calls in a day that are at least half its calls.
- **Sends** the email "a scheduled job ran but its edge function failed" and
  opens its own `incident` issue, "Scheduled job failing: pg_net calls to edge
  functions", separate from the pg_cron one. It closes on the next run where
  every function's latest call worked. A function nothing calls again stays
  listed until its failed call is 8 days old.
- **Can't run** (the same email, saying the check couldn't run) if the
  triggers are gone, for example after a Supabase pg_net upgrade rebuilds its
  tables. Re-run the trigger block of
  `supabase/migrations/20261111190000_pg_net_call_health.sql`.
- **By hand:** `SUPABASE_DB_URL=… pnpm run db:cron-http-health` lists every
  function and its last outcome. For why a function failed, read its logs in
  Supabase (Edge Functions, then the function, then Logs).
- **Turning it off:** only Supabase can remove a trigger from pg_net's tables
  (`postgres` may add one but not drop or disable it). To stop logging,
  recreate `pg_net_calls_log_request()` and `pg_net_calls_log_response()` as
  functions that just `return null`.
- **Proven:** on 2026-11-11, on PLOT Staging, a call to a function that
  doesn't exist answered 404, the check reported it, and a GitHub run opened an
  `incident` issue (#1586, then closed by hand) and sent the email.

Found on the way: on PLOT Staging, `brevo-lifecycle` and
`marketing-notion-mirror` answer 404 on every run (they aren't deployed
there).

## Not watched yet

- Whether an edge function that answered 200 did all its work. A function
  that catches its own error and still answers 200 looks healthy to the pg_net
  check; that needs the function to report it (PostHog, or a failing status).

## Deploying or changing a watcher

The deploy steps are in each Worker's `wrangler.toml` header. Run the unit tests with `pnpm run test:workers`.
