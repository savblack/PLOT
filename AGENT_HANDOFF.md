# auto-rollback

Status: paused (waiting on the Cloudflare token)
Branch: agent/2026-11-12-auto-rollback
Updated: 2026-11-12

Goal: uptime-watch rolls app.theplot.tv back to the previous Pages deployment when the app
check fails within 30 minutes of a deploy, then emails and opens an incident issue.

Done: src/rollback.js, wiring in src/index.js, app check now loads the main script,
tests (test/rollback.test.mjs; test:workers 111 pass), docs/ops/monitoring.md, pnpm run check green.

Next: Savannah adds CF_PAGES_TOKEN (Account > Cloudflare Pages > Edit) to the main .env.
Then: prove on a throwaway Pages project (plot-rollback-test): deploy good, deploy bad,
run maybeRollback against it, confirm the live deployment switched; delete the project.
Then set the Worker secret, open the PR. Merge needs her approval.
