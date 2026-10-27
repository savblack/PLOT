The Brevo definitions match Production, but Staging drift is confirmed. The saved Staging password works; Production rejects its saved password, blocking local restore/function-diff. Keep this PR as a draft. No persistent database changes were made.

Status: paused
Owner: Codex
Updated: 2026-10-27T05:00:09.377242+00:00
PR: https://github.com/savblack/PLOT/pull/1431
Branch: cursor/brevo-api-key-vault-rpc-4dca
Worktree: /Users/savannah/Developer/PLOT-worktrees/2026-10-27-brevo-review
Git common directory: /Users/savannah/Developer/PLOT/.git
Latest pushed code commit: 86b59564bd7d66ec93f0dd3fe8395028de1f904d

Verified: frozen install; pnpm run check; migrations:check; db:block-clause; migrationDriftChecks.test.js, 10 tests. Read-only production ledger confirms version 20261025102415 is present. pg_get_functiondef bodies for get_brevo_api_key and set_brevo_api_key exactly match this file, and ACLs allow only postgres/service_role. Definitions and ledger evidence are in the signup-review worktree's .artifacts/database-review/.

Attempted db:migration-test and db:function-diff after Savannah approved production-data verification. Both stopped before connecting due to missing PLOT_PRODUCTION_DB_PASSWORD or SUPABASE_DB_URL. PostgreSQL 17 is installed; no .env exists in the provided archive or recovered checkout. The existing Supabase CLI login allowed the read-only comparisons, then Keychain access timed out. No DB password was reset and neither database was changed.

Next: securely correct the saved Production database password, then run db:migration-test, db:function-diff, and db:drift. Do not claim these passed. Do not apply Staging migrations or change Brevo schedules without separate authorization. Remove AGENT_HANDOFF.md before merge.

Approvals: database verification approved; merge, production writes, deploys, and credential resets are not approved.

Latest verification (supersedes the earlier missing-configuration blocker):
- Read-only workflow https://github.com/savblack/PLOT/actions/runs/40443927306 completed: Production 174 migrations, Staging 170. Staging lacks versions 20261016120000, 20261016140000, 20261017120000, and 20261025102415. Missing schema objects confirm that blindly recording ledger rows would be wrong.
- Staging differs in feedback-attachments bucket configuration and brevo-lifecycle-sync cron. Inspect environment-specific intent before any repair. Twenty Staging-only legacy objects were warnings.
- Local credentials were recovered from Savannah's .env.rtf into the ignored owner-only .env, without displaying values. Staging authentication works; Production rejected its saved password during signup's restore attempt, before copying data. The empty local sandbox was destroyed. Correct the shared Production credential before repeating either restore gate.
- Signup's new policy passed all four rollback-only Staging assertions. This does not repair Staging or finish Brevo verification.
- Permanent Staging migrations, ledger writes, schedule changes, credential resets, and either held PR merge remain unapproved.
