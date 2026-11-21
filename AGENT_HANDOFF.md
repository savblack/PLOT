# Upgrade the Impeccable design skill to 4.10.0

Status: active
Owner: Claude Code (desktop), for Savannah
Branch: agent/2026-11-21-impeccable-4-10
Worktree: ~/Developer/PLOT-worktrees/2026-11-21-impeccable-4-10
Updated: 2026-11-21

## What and why

Savannah asked to review and upgrade the pinned Impeccable skill from 4.9.2 to
4.10.0. The copy in `.agents/skills/impeccable/` is replaced with upstream's
`.claude/skills/impeccable/` at tag `skill-v4.10.0` (commit `b49177d`, engine
0.1.27). LICENSE kept.

## Review result

- Skill text: 14 files changed. New helper verbs (`shot`, `first-viewport`,
  `font-fetch`, `design-compact`), audit reports save score metadata locally.
- `reference/init.md` gained a prompt telling the agent to ask the user to run
  `npx impeccable login`. Removed locally (AGENTS.md forbids sign-in).
- Engine 0.1.25 -> 0.1.27: critique upload still requires sign-in and still
  honours the `"telemetry": false` opt-out in `.impeccable/config.json`
  (`crates/account/src/critiques.rs` `ready()`, `crates/context/src/telemetry.rs`).
  MCP "presence" is local-only. `font-fetch` downloads Google Fonts only when run.
- `live-browser.js`: no new network calls.

## Next

Done: engine 0.1.27 verified, doctor runs, `pnpm run check` passes, PR opened. Do not merge
unless Savannah asks. Delete this file before merge.
