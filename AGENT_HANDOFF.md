# uptime-watch

Status: active
Branch: agent/2026-11-11-uptime-watch
Worktree: ~/Developer/PLOT-worktrees/2026-11-11-uptime-watch
Owner: Jacob (reliability), built by Claude Code
Updated: 2026-11-11

## In plain words

A new watchdog checks every 5 minutes that the Plot web app, the movie-data proxy and the backend answer. If one stops, it emails Savannah and (optionally) opens a GitHub issue, then emails again when it recovers. Before this, nothing noticed when the app went down.

## Done

- `apps/web/workers/uptime-watch/`: the Worker, its config and 7 unit tests. It reuses `probe` and `decide` from `whats-on-watch`.
- `docs/ops/monitoring.md`: one list of every watcher and what isn't watched yet.
- Verified:
  - `pnpm run check` passes.
  - `pnpm run test:workers` passes 57 of 57.
  - A live run against production was healthy on all 3 checks.
  - Bad URLs are classified as broken.
  - `wrangler deploy --dry-run` bundles.

## Next

1. Merge the PR once Savannah approves.
2. Deploy. This needs a Cloudflare login with Workers access; the `.env` token is DNS-only.
   - Run `npx wrangler kv namespace create uptime-watch-state` and paste the id into `wrangler.toml`.
   - Set the `RESEND_API_KEY` and `WATCH_TOKEN` secrets.
   - Run `npx wrangler deploy`.
   - Confirm with `?test-email=1`.
3. Optional: set a `GITHUB_TOKEN` secret (fine-grained, savblack/PLOT, Issues read/write) so incidents also become GitHub issues.

## Approvals

- Given: Savannah approved the automation plan (Stage 1, ticket 1) on 2026-11-11.
- Still needed: merge, and the production deploy of the Worker.
