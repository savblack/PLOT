# Handoff: production signed-in check

**Plain summary.** The hourly "can people still save what they watched" check
covers Staging today. This adds the same check against production, using a
test account with no password that renews a stored session instead of signing
in, because production sign-in needs a captcha. Code and tests are done.
Nothing has been written to production yet: creating the account and its
first session waits for Savannah's yes.

- Status: active
- Owner: Jacob (CTO bot) area; built by a Claude Code side session
- Branch: agent/2026-11-11-signin-watch-prod
- Worktree: ~/Developer/PLOT-worktrees/2026-11-11-signin-watch-prod
- Last updated: 2026-11-11

## Done
- `apps/web/workers/uptime-watch/src/signin.js`: `readWrite` with password (Staging) or refresh-token (production) sessions; the renewed token is stored before use; refuses any account but the watcher's; production never signs out.
- `src/index.js`: Staging and production as separate groups (`signin-state`, `signin-prod-state`) with their own email wording.
- `scripts/signin-watch-seed.mjs`: creates the account (`--create`) and seeds the session through admin magic link and /verify; needs `--yes-production`.
- Tests: `pnpm run test:workers` 86/86.

## Next (needs Savannah's yes for 1 and 2)
1. `node scripts/signin-watch-seed.mjs --yes-production --create` from the main checkout.
2. `npx wrangler secret put SIGNIN_PROD_PUBLISHABLE_KEY`, deploy uptime-watch, run `?check=signin`.
3. Prove a broken production write alerts (locally, as on Staging, with a bad on_conflict).
