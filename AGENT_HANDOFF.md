# backend-error-reporting

Status: active
Branch: agent/2026-11-11-backend-error-reporting
Worktree: ~/Developer/PLOT-worktrees/2026-11-11-backend-error-reporting
Owner: Jacob (reliability), built by Claude Code
Updated: 2026-11-11

## In plain words

28 backend functions logged their errors where nothing watched them. They now also send those errors to PostHog, so the new PostHog alert "Backend function errors (auto)" (Slack, more than 2 errors an hour) covers all 39 functions, not 6.

## Done

- `supabase/functions/_shared/posthogLog.ts`: `reportError(service, ...parts)`, a drop-in for `console.error`. It still prints to the function log, and it also sends the line to PostHog Logs. Error objects contribute their message only (never PostgREST `details`), and emails are masked. Covered by a new test in `posthogLog.test.ts`.
- 77 `console.error(` calls in 28 functions became `reportError('<function>', `, each with one import.
- PostHog (live, outside the repo): log alert `Backend function errors (auto)` (id 01a1c971-3a0e-7542-aa90-91254d6c84cf) posting to the Slack channel the error-tracking alerts already use.
- Verified: `pnpm run edge:check` passes (149 shared tests, lint, 39 typechecks). `pnpm run lint` passes.

## Next

1. Merge. Edge functions deploy from main through the Supabase integration, so check that `supabase-deploy-guard` passes after merge.
2. Savannah: replace `BREVO_API_KEY` in Supabase production secrets. Since 2026-11-06, `brevo-lifecycle` has failed with "Key not found".

## Approvals

- Given: Savannah said "Yes, do it" on 2026-11-11.
- Still needed: merge.
