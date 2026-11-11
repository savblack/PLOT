# What watches Plot

Each watcher runs on Cloudflare's cron, which fires on time, unlike GitHub's
schedule. Every watcher emails `sav.black@outlook.com` once when something
breaks, sends a reminder every few hours while it lasts, and emails again when
it recovers.

| Watcher | Every | Checks | Lives in |
|---|---|---|---|
| uptime-watch | 5 min | app.theplot.tv serves the app shell. The TMDB proxy returns trending titles. Edge functions answer (`billing-availability`). | `apps/web/workers/uptime-watch` |
| uptime-watch, signed-in check | hourly | A test account on PLOT Staging signs in, reads its own profile and History, saves a watched title the way the app does, and deletes it. Catches the July 2026 shape: pages load but saving fails. | `apps/web/workers/uptime-watch/src/signin.js` |
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

### The signed-in check

It signs in as `plot-signin-watch@example.invalid`, an account on PLOT Staging
that exists only for this check. Its password is in the Mac's Keychain
(`com.theplot.staging.signin-watch.password`) and in the Worker's
`SIGNIN_PASSWORD` secret, never in the repo. Each run writes one History row
marked `plot-signin-watch` in its note and deletes it again; a row left by an
interrupted run is cleaned up by the next one. The title comes from the TMDB
proxy's trending list, so no TMDB id is hardcoded.

It has its own emails ("saving to History is failing on Staging") and its own
stored state, separate from the uptime checks.

It watches Staging, not production. Staging gets the same migrations as
production (`migration-drift` checks that nightly), so a migration that breaks
saving breaks it on both. Production can't be watched this way as it stands:
production sign-in requires a Turnstile captcha, which a Worker can't solve, and
a production test account would be a write to live sign-in data that needs
Savannah's yes first.

## Not watched yet

- A signed-in read and write against production itself (see above for why the check runs on Staging).
- Stripe webhook delivery failures, pg_cron job failures, and PostHog exception spikes.

## Deploying or changing a watcher

The deploy steps are in each Worker's `wrangler.toml` header. Run the unit tests with `pnpm run test:workers`.
