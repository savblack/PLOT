# self-fix-merge

Status: active
Branch: agent/2026-11-11-self-fix-merge
Owner: Jacob (CI/deploys), built by Claude Code
Updated: 2026-11-11

## In plain words

Agent fixes of the kinds Savannah allowed can now go live on their own, once every check passes and Strix has reviewed them. She gets one email each morning listing them. Anything touching payments, the database, permissions or member data still waits for her.

## Done

- `scripts/lib/autoMergePolicy.mjs` holds the rules, with 11 tests in `apps/web/tests/unit/autoMergePolicy.test.js`.
- `scripts/auto-merge.mjs` and `.github/workflows/auto-merge.yml` run every 15 minutes. They only look at PRs labelled `agent-fix`.
- `.github/workflows/self-fix-digest.yml` sends the daily email at 21:00 UTC.
- Labels `agent-fix`, `needs-savannah` and `auto-merged` were created in the repo.
- Verified: `pnpm run check` passes, the unit tests pass, and a read-only dry run against PRs 1587, 1580, 1568, 1573 and 1559 gave the expected verdicts.

## Next

1. Savannah adds the `AUTO_MERGE_TOKEN` secret (fine-grained, savblack/PLOT, Contents and Pull requests read/write). Until then it only reports.
2. Merge this PR.
3. Set up the routine that opens fixes for `incident` issues and labels them `agent-fix`.
