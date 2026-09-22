---
name: plot-worktree
description: >-
  Start any new PLOT feature, fix, or task in an isolated sibling Git worktree
  at ../PLOT-worktrees. Use before writing code when branching off main, when
  another agent may be working in parallel, or when something mentions
  new-feature / worktrees. Never nest worktrees under the PLOT checkout.
---

# PLOT worktree

PLOT-owned skill (not from `npx skills`). Survives `npx skills update`.
Canonical summary also lives in `AGENTS.md` (that file wins on conflict).

Every task gets its own worktree and branch from `origin/main`. Never build on
`main`. Never reuse another agent's worktree, branch, or uncommitted work.

## Location (required)

```
Sites/Cursor/
  PLOT/                 ← main checkout
  PLOT-worktrees/       ← all agent worktrees
    <task-name>/
```

From the **main checkout** root:

```bash
mkdir -p ../PLOT-worktrees
git worktree add ../PLOT-worktrees/<task-name> \
  -b agent/<task-name> origin/main
```

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

3. **Name the task**: lowercase-with-hyphens plus a short unique suffix
   (e.g. `user-auth-0816a`). On name collision, pick a new name. Never force
   or reuse.

4. **Create** (from main checkout root):

   ```bash
   mkdir -p ../PLOT-worktrees
   git worktree add ../PLOT-worktrees/<task-name> \
     -b agent/<task-name> origin/main
   ```

5. **Enter and verify**:

   ```bash
   cd ../PLOT-worktrees/<task-name>
   git branch --show-current   # must print agent/<task-name>, not main
   pnpm install                # worktrees do not share node_modules
   ```

   Confirm Node 22 before running anything.

## Cleanup (after merge or close)

From the main checkout:

```bash
git worktree remove ../PLOT-worktrees/<task-name>
git branch -D agent/<task-name>
```

`-D` is expected after squash/rebase merges.

## Remember

- Ports, shared DBs, and lockfiles are not isolated. Confirm a port is *your*
  process before trusting it. Resolve lockfile conflicts by regenerating.
- Keep the worktree until the PR is merged or closed.
