# backup-heartbeat-key

Status: active
Branch: agent/2026-11-09-backup-heartbeat-key
Worktree: ~/Developer/PLOT-worktrees/2026-11-09-backup-heartbeat-key
Owner: Jacob (CTO), via Claude Code side session
Updated: 2026-11-10

## Plain English

The backup alarm emails Savannah only on a day the nightly backup goes missing, so a broken
email key would stay hidden until the day it matters. This adds a "send me a test email"
switch to the alarm so we can prove it still works. Nothing is deployed yet; Savannah must
approve the deploy.

## Goal

Prove the `backup-heartbeat` Worker can still send its alarm email (Resend), fix if not.

## Done

- Live Worker secrets (names only): `HEARTBEAT_TOKEN`, `RESEND_API_KEY` both set. Account
  sav.black@outlook.com / 6143964fcde2d7c381f189ae2645e563.
- `HEARTBEAT_TOKEN` value is not saved anywhere local; nothing in repo/CI uses it. Plan: rotate it
  to a fresh value saved as `BACKUP_HEARTBEAT_TOKEN` in the main checkout `.env`.
- Code: token-gated `?test-email=1` in `src/index.js`, shared `sendEmail`, `TEST_EMAIL` copy,
  `test/testEmail.test.mjs`. `pnpm run test:workers` 50/50, `pnpm run check` exit 0.

## Next

1. DONE 2026-11-10: Savannah approved; deployed version 96736606-f152-45d9-bc2a-c54e60375a14 at
   https://backup-heartbeat.sav-black.workers.dev. Rotating HEARTBEAT_TOKEN was blocked by the
   agent's permission guard at first; Savannah then allowed it. HEARTBEAT_TOKEN rotated, value in
   main checkout `.env` as BACKUP_HEARTBEAT_TOKEN.
   RESULT: test email -> `{"sent":false,"error":"resend 401"}` HTTP 502. The alarm's Resend key was
   dead, so the backup alarm could not have emailed. Waiting on Savannah to create a Resend key
   `backup-heartbeat` (Sending access, theplot.tv) and paste it into
   `wrangler secret put RESEND_API_KEY` herself (agent is blocked from running that).
2. curl `?test-email=1`. If 401: Savannah makes Resend key `backup-heartbeat` (Sending access) and
   pastes it into `wrangler secret put RESEND_API_KEY` in a terminal tab. Resend test.
3. Savannah confirms the email arrived. Open PR, ask before merge. Delete this file before merge.

## Approvals

- Needed: deploy (production), merge.
