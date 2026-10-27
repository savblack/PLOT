Signup fixes are pushed, and the proposed feedback attachment policy passes four rollback-only Staging checks. Staging connects, but Production rejects its saved password. Keep this PR held for Production restore checks, Staging drift repair, and real email/device verification.

Status: paused
Owner: Codex
Updated: 2026-10-27T05:00:09.377242+00:00
Goal: Finish existing signup/auth/feedback PR #1435.
PR: https://github.com/savblack/PLOT/pull/1435
Branch: cursor/signup-auth-feedback-fixes-cfdc
Worktree: /Users/savannah/Developer/PLOT-worktrees/2026-10-27-signup-review
Main checkout: /Users/savannah/Developer/PLOT
Git common directory: /Users/savannah/Developer/PLOT/.git
Latest pushed code and CI-tested commit: 589fa3d0209d2e826d5341cdaff74102ccec8938

Completed:
- Restored the existing remote branch; original Cursor cloud task had completed and no original local worktree or lock was available.
- Reproduced the native captcha retry failure and four magic-link failure cases before fixing them. Five captcha regressions and six new server cases pass afterward.
- Preserved late tokens on web/mobile, restored reset before a fresh widget execution, and left the challenge running between waits within one submit.
- Extracted server magic-link delivery for testing. GoTrue verification_type=signup identifies implicitly created accounts; failed delivery or follow-up generation removes only that owned account. Existing accounts are retained.
- Moved pure auth decisions and file-signing logic into packages/core with existing web re-export paths.
- pnpm run check passed, 0 lint errors and 175 existing warnings. Unit suites passed 542 web, 1202 core, 14 scripts. Mobile typecheck passed. edge:check passed 39 functions, 121 shared tests and edge lint. Static migration, copy, and core import guards passed.
- Eight Chromium auth/widget smoke tests passed. A computer-use check of the real web component using mocked Cloudflare behavior showed a fresh retry receiving a token. No real captcha was solved and no real account or email operation ran.
- GitHub and CircleCI confirm successful CI on the code commit above. Both original Bugbot findings are resolved/outdated; no open review thread was present on recheck.
- Published https://github.com/savblack/PLOT/issues/1437 after Savannah's explicit approval, using gh because the connector returned 403.
- Installed PostgreSQL 17. Attempted approved db:migration-test and db:drift; both stopped before connecting because no production DB password/connection string or main .env is available. No restore occurred.
- Existing Supabase CLI login verified PLOT Production and PLOT Staging project identities. Read-only production queries found 174 migration rows and the Brevo backfill version; both Brevo function bodies match PR #1431 and ACLs grant only postgres/service_role. No secret values or user rows were queried. Later Keychain access timed out, so additional schema checks stopped.

Latest verification (supersedes earlier connection blockers):
- Savannah supplied .env.rtf. Both credentials were converted to an owner-only .env; both files are Git-ignored. No values were displayed or committed. Staging authentication works. Production rejects its saved password. The attempted local db:migration-test copied no Production data and destroyed the empty sandbox.
- Added scripts/staging-feedback-attachments-test.sql and pnpm run staging:feedback-attachments-test. All four assertions passed under real auth.uid()/roles: owner can read fictional attachment metadata, another account cannot, anon cannot, and the proposed bucket is private. This PR's migration and the test run in one transaction ending in rollback. No physical file, auth account, or persistent schema/data change was created.
- Frozen install and pnpm run check passed after adding the test command. Existing application code is unchanged.
- Local read-only Staging ledger: 170 entries. Missing main migrations: 20261016120000, 20261016140000, 20261017120000. This PR's 20261025120000 is separately recognized as expected branch-new.
- GitHub drift run https://github.com/savblack/PLOT/actions/runs/40443920202 failed initially because its hosted runner lost communication; retry confirmed Staging schema drift. Its shallow checkout misclassified expected branch-only migration differences as main differences. Local runs with origin/main distinguish these correctly.
- Brevo run https://github.com/savblack/PLOT/actions/runs/40443927306 confirms the same schema differences. Twenty missing Staging objects include the Brevo functions and Notion fields; feedback bucket and Brevo cron differ. Do not blindly record ledger rows while objects are absent or copy a Production cron into Staging without checking its destination.

Exact next action:
Once Savannah corrects the Production database password locally, run db:migration-test here and db:migration-test/db:function-diff on Brevo. Reconcile both PRs' migration files before final drift verification: Production already records Brevo version 20261025102415, absent on this signup branch. Prepare and obtain approval for permanent Staging repairs. Real Staging email and iOS checks and the saved Kaia gate remain open. Mobile fallback parity remains issue #1437. Remove AGENT_HANDOFF.md in the last commit before merge.

Approvals:
Savannah explicitly approved database verification, including production-data read/local restore, and publishing the mobile follow-up on 2026-10-27. No merge, production write, credential reset, payment, or deployment is authorized. Earlier automatic review rejections were followed by that approval; the remaining Production connection blocker is a rejected saved database password. Permanent Staging repairs and merging either held PR are not approved.

Evidence: .artifacts/signup-review/ and .artifacts/database-review/ in this worktree. Do not commit or publish token-bearing session files. Use PATH=/private/tmp/plot-tools:/Users/savannah/.local/bin:$PATH for pinned pnpm 10.6.3 and Deno. The recovered main checkout and all seven sibling worktrees now use permanent Git metadata, not /tmp.
