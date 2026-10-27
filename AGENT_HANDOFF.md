Signup recovery fixes are pushed and verified. Captcha retries now recover, late tokens are preserved, and failed magic-link delivery cleans up only newly created accounts. Savannah approved database verification and publication of the mobile follow-up, which is now issue #1437. Do not merge yet: the full database restore tests and Staging policy/device checks remain unfinished.

Status: paused
Owner: Codex
Updated: 2026-10-27T00:48:33.929162+00:00
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

Exact next action:
Restore the author's existing database connection configuration through its normal secure login/storage flow, without asking for a secret in chat or resetting a database password. Run pnpm run db:migration-test and pnpm run db:drift on this branch. Verify the feedback owner-read policy in a rollback-only Staging test, including another user's denial. Finish real Staging email and iOS runtime checks, and retain the saved Kaia review gate. Mobile fallback parity is tracked in #1437 and is not implemented by this PR. Remove AGENT_HANDOFF.md in the last commit before merge.

Approvals:
Savannah explicitly approved database verification, including production-data read/local restore, and publishing the mobile follow-up on 2026-10-27. No merge, production write, credential reset, payment, or deployment is authorized. Earlier automatic review rejections were followed by that approval; the remaining blocker is missing secure database configuration, not missing approval.

Evidence: .artifacts/signup-review/ and .artifacts/database-review/ in this worktree. Do not commit or publish token-bearing session files. Use PATH=/private/tmp/plot-tools:/Users/savannah/.local/bin:$PATH for pinned pnpm 10.6.3 and Deno. The recovered main checkout and all seven sibling worktrees now use permanent Git metadata, not /tmp.
