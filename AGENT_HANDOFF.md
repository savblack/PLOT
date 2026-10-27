The signup PR still needs fixes before it can safely ship. Two review findings are open: captcha retry state and failed magic-link account creation. Savannah asked Codex to review and finish the existing PRs. No merge or production change has been performed.

Status: active
Owner: Codex
Updated: 2026-10-27 Australia/Sydney
Branch: cursor/signup-auth-feedback-fixes-cfdc
Worktree: /Users/savannah/Developer/PLOT-worktrees/2026-10-27-signup-review
Git common directory recovered from GitHub: /private/tmp/plot-pr-recovery.git
Latest pushed commit: 704a6e586ce4264ce41fa6037d62b241e2cc7013
PR: https://github.com/savblack/PLOT/pull/1435

Verified: GitHub account savblack. Existing Cursor cloud task is completed. No original local worktrees are available at Developer, Sites/Cursor, or .cursor/worktrees/PLOT in this session. The supplied PLOT-main folder is a source archive without .git, dependencies, or .env. Recovered the actual existing PR branch in a sibling worktree. CircleCI is green on the original head; two Bugbot review threads remain unresolved.

Next: reproduce both failures, fix shared captcha lifecycle and magic-link failure handling, run unit suites, check, mobile typecheck, edge:check, and record real runtime-test limitations. Required database checks need credentials and local Postgres; no credentials are present in the source archive.

Review queue: #1434 premium copy/telemetry; #1433 guide warning plus stale documentation; #1431 production Brevo migration backfill; #1428 App Store version; dependency PRs #1413 and #1430. Existing iOS smoke task from Grok mentions smoke-aes-gcm-170960 and smoke-old-4d62a07c3, preserve both if recovered. Do not delete simulator data or change SMTP credentials.

Approvals: finish branch work and push checkpoints authorized. Merges, production changes, public posts, and sending still need Savannah approval. Grok UI shows a submitted answer to merge #1431/#1433/#1434 and wait for Kaia on #1435, but no merge action has been taken here. Recheck that approval against current heads before any merge.

Progress: Reproduced native retry failure, 1 failing / 1 passing before fix; reproduced implicit-account mail failures, 4 failing / 2 passing. Fixed all three widget wrappers to reset on a new execution request while the form still leaves the challenge alone between waits. Web and mobile preserve late tokens. Extracted deliverMagicLink to a testable server helper and use GoTrue verification_type=signup to identify implicit new accounts for failed-mail cleanup. Existing accounts are never deleted by this helper. All 5 captcha regression tests and 6 magic-link tests pass. Evidence is local in .artifacts/signup-review/. No live account was created, emailed, or deleted.

Full check/unit/mobile/edge suites are running. Installation used corepack pnpm 10.6.3; bundled pnpm 11 failed against the unchanged lockfile. For all later commands prepend PATH=/private/tmp/plot-tools:/Users/savannah/.local/bin:$PATH so nested pnpm calls stay pinned.

Shared-core review complete: authBypass.js and authCallbackReport.js now live in packages/core, with web re-export shims. Their tests moved to core; file-signing logic is shared in packages/core/feedbackAttachments.js. Final checks after that move pass: 542 web tests, 1202 core tests, 14 script tests, pnpm run check with 0 errors and 175 pre-existing warnings, mobile typecheck, 8 Chromium auth/widget smoke checks. Earlier edge:check passed 39 functions, 121 shared server tests and edge lint. The real web widget was also clicked through the local mocked fixture via computer use: first submit waited, second submit returned retry-token. No real Cloudflare challenge was solved. Video recording was unavailable because ffmpeg/ffprobe were missing.

BLOCKERS: automatic approval review rejected db:migration-test and db:drift because they may restore/read production data locally without Savannah's specific approval. Do not retry indirectly. No PostgreSQL 17 or .env is available here either. PR #1431 needs db:migration-test, db:function-diff, and db:drift; #1435 needs db:migration-test and db:drift, plus a Staging ownership-policy check. No database check has been claimed as passed.

Mobile fallback parity is still missing, as the original PR acknowledged. Tried to file the required GitHub parity issue; automatic approval review rejected it as a public post requiring Savannah approval. It was NOT created. Keep this follow-up here and in the PR description until issue approval is resolved.

Connected Notion account is Savannah's work address, savannah@cryptotaxcalculator.io, rather than the Plot accounts listed in AGENTS.md. Stopped without reading or changing task pages. Handoffs remain in the coding branches instead.
