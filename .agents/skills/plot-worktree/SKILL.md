---
name: plot-worktree
description: >-
  Start any new Plot feature, fix, or task in an isolated sibling Git worktree
  at ~/Developer/PLOT-worktrees. Use before writing code when branching off main, when
  another agent may be working in parallel, or when something mentions
  new-feature / worktrees. Never nest worktrees under the Plot checkout.
---

# Plot worktree

Plot-owned skill (not from `npx skills`). Survives `npx skills update`.
Canonical summary also lives in `AGENTS.md` (that file wins on conflict).

Every task gets its own worktree and branch from `origin/main`. Never build on
`main`. Another agent may claim a worktree only when `AGENT_HANDOFF.md` says
`paused`, or the local lock is stale (active, older than 12 hours, clean tree,
no newer commit). Two writers at once are forbidden.

## Location (required)

```
~/Developer/
  PLOT/                 ← main checkout
  PLOT-worktrees/       ← all agent worktrees
    <YYYY-MM-DD-task>/  ← branch agent/<YYYY-MM-DD-task>
```

From the **main checkout** root:

```bash
pnpm run worktrees -- new <short-task-name>
```

That creates `../PLOT-worktrees/<YYYY-MM-DD-task>`, branch `agent/<YYYY-MM-DD-task>`, symlinks the main `.env`, and writes `AGENT_HANDOFF.md`. Cloud Cursor branches stay `cursor/<name>-ff25`. Attach one with `pnpm run worktrees -- attach <branch>`.

**Never** create worktrees under `.claude/worktrees/`, `.worktrees/`, or any
other path inside `PLOT/`. Nested trees make TypeScript walk up into the parent
`node_modules` and typecheck the wrong `@plot/core` (see `core:check` in
`AGENTS.md`).

## Happy path only: sibling

When **you** create the worktree, always use `../PLOT-worktrees/` (steps below).
That is the only happy path. Do not offer nested paths as an option.

## Fallback only: harness already nested

Cursor or Claude Code may open a session under `.claude/worktrees/` (or similar)
inside this repo. That is **not** an approved workflow. Do not treat "keep the
nested checkout and run `core:check`" as normal.

**Required response when you detect a nested worktree:**

1. **Stop before writing code.** Tell the user the checkout is nested and unsafe
   for `@plot/core` resolution.
2. **Recreate on the happy path** (from the main checkout): same branch tip or a
   fresh `agent/<task-name>` on `../PLOT-worktrees/`, then continue there.
3. **Only if the user explicitly says to stay nested** for this session: keep the
   harness branch name, treat local `tsc` as untrusted, and run
   `pnpm run core:check` (prefer `pnpm run check`) before any type claim. If the
   task touches `packages/core`, refuse to stay nested. Ask again to move to
   `../PLOT-worktrees/`.

Never invent a nested worktree yourself. Never document nested + `core:check` as
the default isolate step.

## Steps

1. **Sync**: `git fetch origin`.

2. **Scope check**: `gh pr list`, then `gh pr diff <n> --name-only` for overlap.
   If this task needs files another open PR is editing, **stop and ask**. Also
   check for uncommitted work in shared checkouts.

3. **Name the task**: lowercase-with-hyphens, no date. The script adds the date.
   On name collision, pick a new name. Never force or reuse.

4. **Create** (from main checkout root): `pnpm run worktrees -- new <short-task-name>`.

5. **Enter and verify**:

   ```bash
   cd ../PLOT-worktrees/<YYYY-MM-DD-task>
   git branch --show-current   # must print agent/<YYYY-MM-DD-task>, not main
   pnpm install                # hardlinks into the shared pnpm store
   ```

   Confirm Node 22 before running anything. Only one worktree runs the app. They share port 5177.

## Pause and claim

When you stop, including because you are out of tokens:

```bash
pnpm run worktrees -- pause --next "One plain sentence about what to do next."
```

Commit `AGENT_HANDOFF.md` and push the branch. Do not open a pull request just to pause. The note must not contain a password, a token, or a value from `.env`.

The next agent fetches and, inside that worktree, runs `pnpm run worktrees -- claim --agent <name>`. It reads the note and continues from `next` plus the last commit.

Before the pull request merges, run `pnpm run worktrees -- done` and commit the removal of `AGENT_HANDOFF.md`.

## Cleanup (after merge or close)

From the main checkout, only when the session is `done` or the pull request is merged, and the tree is clean:

```bash
git worktree remove ../PLOT-worktrees/<YYYY-MM-DD-task>
git branch -D agent/<YYYY-MM-DD-task>
```

`-D` is expected after squash/rebase merges. Do not remove an `active` or dirty worktree.

## Remember

- Ports, shared DBs, and lockfiles are not isolated. Confirm a port is *your*
  process before trusting it. Resolve lockfile conflicts by regenerating.
- Keep the worktree until the PR is merged or closed.
