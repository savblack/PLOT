# impeccable-skill

Status: paused
Branch: agent/2026-11-18-impeccable-skill
Worktree: ~/Developer/PLOT-worktrees/2026-11-18-impeccable-skill
Owner: Jacob (CTO: tooling and security)
Updated: 2026-11-18

## In plain words

Added the Impeccable design-review skill to Plot so agents can critique and
polish screens. It was reviewed first and installed with its risky parts off:
no automatic check on every edit, no usage reporting, no account sign-in, and
its "live" mode must not start a background Claude with safety checks off.
Savannah approved installing it this way. Nothing is merged; merging needs her OK.

## Done

- Reviewed upstream `pbakaus/impeccable` commit `d41d986` (skill 4.9.2, engine 0.1.25).
- Copied `.claude/skills/impeccable` from that commit, unchanged, to
  `.agents/skills/impeccable` (+ upstream LICENSE). Helper sub-agents and hooks
  deliberately not installed.
- `.impeccable/config.json`: `"telemetry": false` (project-wide opt-out).
- `AGENTS.md` (Agent skills): pin record and usage rules.
- `eslint.config.js`: ignore the vendored skill folder (its 48 lint errors are upstream code).
- Engine download verified: sha256 matches `engine-checksums.txt`; `impeccable context` runs.
- `pnpm run check`: pass (0 errors, 168 pre-existing warnings).

## Local-only (main checkout, gitignored)

- `PLOT/.claude/skills/impeccable` symlink to `../../.agents/skills/impeccable`
  so Claude Code loads it once this branch is on main.
- `PLOT/.claude/settings.json` env: `DO_NOT_TRACK=1`, `IMPECCABLE_LIVE_COPY_AGENT=chat`.

## Next

Open a PR when Savannah asks; it is tooling-only (no app, schema, or user-facing change).
Delete this file in the last commit before merge.
