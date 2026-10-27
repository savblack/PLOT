The Brevo migration file matches the two live Production function bodies, and their grants are restricted to postgres/service_role. Static checks pass. The full restore/function-diff gates could not run because this Mac lacks the saved database connection configuration, so the PR remains a draft for Savannah.

Status: paused
Owner: Codex
Updated: 2026-10-27T00:48:33.929162+00:00
PR: https://github.com/savblack/PLOT/pull/1431
Branch: cursor/brevo-api-key-vault-rpc-4dca
Worktree: /Users/savannah/Developer/PLOT-worktrees/2026-10-27-brevo-review
Git common directory: /Users/savannah/Developer/PLOT/.git
Latest pushed code commit: 86b59564bd7d66ec93f0dd3fe8395028de1f904d

Verified: frozen install; pnpm run check; migrations:check; db:block-clause; migrationDriftChecks.test.js, 10 tests. Read-only production ledger confirms version 20261025102415 is present. pg_get_functiondef bodies for get_brevo_api_key and set_brevo_api_key exactly match this file, and ACLs allow only postgres/service_role. Definitions and ledger evidence are in the signup-review worktree's .artifacts/database-review/.

Attempted db:migration-test and db:function-diff after Savannah approved production-data verification. Both stopped before connecting due to missing PLOT_PRODUCTION_DB_PASSWORD or SUPABASE_DB_URL. PostgreSQL 17 is installed; no .env exists in the provided archive or recovered checkout. The existing Supabase CLI login allowed the read-only comparisons, then Keychain access timed out. No DB password was reset and neither database was changed.

Next: securely restore the existing DB connection configuration, then run db:migration-test, db:function-diff, and db:drift. Do not claim these passed. Do not apply Staging migrations or change Brevo schedules without separate authorization. Remove AGENT_HANDOFF.md before merge.

Approvals: database verification approved; merge, production writes, deploys, and credential resets are not approved.
