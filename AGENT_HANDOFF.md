# Handoff: signed-in read and write check

**Plain summary.** Plot's uptime watcher now has a second, hourly check that
signs in as a test account on Staging, saves a watched title and removes it
again, and emails if any step fails. That would have caught the July 2026
outage (saving to History broken for two weeks) within an hour. The Staging
test account now exists (Savannah approved it on 2026-11-11) and the check has
run live. Before it runs on its own schedule, the Worker needs two secrets and
a deploy.

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

- Staging account `plot-signin-watch@example.invalid` created 2026-11-11 (user id 32388655-51eb-40a1-bc93-f206fb447c25), email confirmed. Password in Keychain `com.theplot.staging.signin-watch.password`.
- Live proof on Staging, run from this Mac: healthy run passed; a write with `on_conflict=user_id,tmdb_id` returned the real 42P10; `run()` with that fault produced the down email ("Plot: saving to History is failing on Staging", Resend call captured, not sent), then a recovery email on the next healthy run; 0 history rows left on the account.

## Not done / needs approval
- Set Worker secrets `SIGNIN_PUBLISHABLE_KEY` (Staging) and `SIGNIN_PASSWORD`, then `npx wrangler deploy` in `apps/web/workers/uptime-watch`.
- A real email delivered through Resend: only possible once the Worker is deployed (`?check=signin&test-email=1`).
- Production: password sign-in there requires a Turnstile captcha, so a production check needs a different design (e.g. a stored refresh token) plus a production test account. Savannah's call.
