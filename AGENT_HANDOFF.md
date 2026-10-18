# Share previews recover after lookup failures

Jacob reliability work, implemented by Codex. Active October 19, 2026 Sydney.
PR https://github.com/savblack/PLOT/pull/1393
Branch agent/og-no-cache-failures. Worktree /Users/savannahblack/Developer/PLOT-worktrees/og-no-cache-failures.
Original remote head 42a8798e15972cfca1a5c36eefa14bee96bd0230. Existing clean worktree had no handoff or session lock. Refreshed from origin/main without conflicts, merge pending.

Savannah authorized finishing implementation and preparing review. Merge and production deployment remain unapproved. No database/user-data writes.
Production GET /og?u=savannah still returns image/png, 13360 bytes, X-Plot-Cache hit, 7-day shared caching, Last-Modified October 17. Existing PR distinguishes failed lookup from missing resource and bumps card cache version.

Implementation complete. Added renderer failure/recovery test using actual local fonts and pinned WASM; simulated profile, list, post, network and malformed JSON failures. All incomplete font sets now retry. Renderer test passes and fails against original main. Four Node cache tests pass. Full pnpm check and edge check passed. Final lint/verification running; next push updated PR for hosted checks. No overlapping files found in other open PRs.
