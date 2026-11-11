# Handoff: signed-in read and write check

**Plain summary.** Plot's uptime watcher now has a second, hourly check that
signs in as a test account on Staging, saves a watched title and removes it
again, and emails if any step fails. That would have caught the July 2026
outage (saving to History broken for two weeks) within an hour. The Staging
test account now exists (Savannah approved it on 2026-11-11) and the check has
run live. On 2026-11-11 the Worker was deployed from this branch with both
secrets set, so the check now runs every hour at :23. Left: merge the PR.

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

- Deployed 2026-11-11 at Savannah's request: secrets `SIGNIN_PUBLISHABLE_KEY` (Staging) and `SIGNIN_PASSWORD` set, `npx wrangler deploy` from this branch, version 2eec8248-53df-4284-a09c-452b86321654, triggers `*/5 * * * *` and `23 * * * *`. Manual `?check=signin` on the live Worker returned healthy, and the uptime checks were still healthy.

- Test email sent through the live Worker (`?check=signin&test-email=1`) on 2026-11-11; Savannah confirmed it arrived.

## Not done / needs approval
- The live Worker runs this branch's code. Merge the PR so main matches it. A deploy of uptime-watch from an older main would drop the hourly check.
- To deploy, `apps/web/.wrangler/deploy/config.json` (left behind by `pnpm run check`'s build) had to be deleted first, or wrangler refuses.
- Production: password sign-in there requires a Turnstile captcha, so a production check needs a different design (e.g. a stored refresh token) plus a production test account. Savannah's call.
