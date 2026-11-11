# Handoff: signed-in read and write check

**Plain summary.** Plot's uptime watcher now has a second, hourly check that
signs in as a test account on Staging, saves a watched title and removes it
again, and emails if any step fails. That would have caught the July 2026
outage (saving to History broken for two weeks) within an hour. Before it can
run, Savannah needs to approve creating the test account on Staging, and the
Worker needs two secrets and a deploy.

- Status: active
- Owner: Jacob (CTO bot) area; built by a Claude Code side session
- Branch: agent/2026-11-11-signin-watch
- Worktree: ~/Developer/PLOT-worktrees/2026-11-11-signin-watch
- Last updated: 2026-11-11

## Done
- `apps/web/workers/uptime-watch/src/signin.js`: the check (sign in, read profile + history, upsert history on the app's conflict target, delete, sign out).
- `src/index.js`: second cron (`SIGNIN_CRON`), own state key `signin-state`, own email copy, `?check=signin` on the manual endpoint.
- `wrangler.toml`: hourly cron, Staging URL, account email, secret setup steps.
- `test/signin.test.mjs`: 12 tests, including a July-style 42P10 write failure producing the down email.
- `docs/ops/monitoring.md`: watched list updated.

## Not done / needs approval
- Create the Staging account `plot-signin-watch@example.invalid` (the agent's attempt was blocked by the permission system). Password goes in Keychain `com.theplot.staging.signin-watch.password`.
- Set Worker secrets `SIGNIN_PUBLISHABLE_KEY` (Staging) and `SIGNIN_PASSWORD`, then `npx wrangler deploy` in `apps/web/workers/uptime-watch`.
- Live proof against Staging (run once healthy, once with a broken write) after the account exists.
- Production: password sign-in there requires a Turnstile captcha, so a production check needs a different design (e.g. a stored refresh token) plus a production test account. Savannah's call.
