# Agent worktrees

One checkout, shared by every coding agent on this Mac. A second agent continues a task by reading the branch, not the chat.

Savannah's main interface is her Grok bots. Who does what is in `AGENTS.md` under "Who Savannah talks to". Chris owns the morning plan. Cursor does not write a second one.

The main checkout is `~/Developer/PLOT`. Each task is a folder under `~/Developer/PLOT-worktrees/`, next to it, never inside it. `~/Developer` is the home folder you already created. It is not `~/Library/Developer`, which is Xcode's cache.

This file does not move the checkout. After you move it yourself, reopen the folder in each app. An app still pointed at `Sites/Cursor` keeps writing to the old place.

```bash
# Quit every app that has the repo open, then:
mv ~/Sites/Cursor/PLOT ~/Developer/PLOT
```

Do not create `~/Developer/PLOT-worktrees` first. If that folder already exists, `mv ~/Sites/Cursor/PLOT-worktrees ~/Developer/PLOT-worktrees` puts the task folders inside it, one level too deep, and the repair looks in the wrong place.

```bash
# Only if the task folders are still at the old path:
mv ~/Sites/Cursor/PLOT-worktrees/* ~/Developer/PLOT-worktrees/
rmdir ~/Sites/Cursor/PLOT-worktrees

cd ~/Developer/PLOT
for dir in ~/Developer/PLOT-worktrees/*/; do
  git worktree repair "${dir%/}"
done
git worktree list
```

Lines that say `gitdir incorrect` or `gitdir unreadable` mean Git rewrote the pointer. The list should then show `~/Developer/PLOT` and every task folder under `~/Developer/PLOT-worktrees`.

## Everyday commands

From the main checkout:

```bash
pnpm run worktrees                  # what is open, who holds it, what is next
pnpm run worktrees -- new watchlist-empty
pnpm run agent-disk                 # what is using disk. Deletes nothing.
pnpm run agent-disk -- --apply      # delete chat files older than 14 days
```

`new` creates `~/Developer/PLOT-worktrees/<date>-watchlist-empty`, branch `agent/<date>-watchlist-empty`, a link to the main `.env`, and `AGENT_HANDOFF.md`.

When an agent stops, it writes the next step and pushes the branch. It does not open a pull request just to pause.

```bash
pnpm run worktrees -- pause --next "The empty watchlist still shows the wrong sentence."
```

The next agent fetches that branch and, inside the worktree, runs:

```bash
pnpm run worktrees -- claim --agent claude-code
```

`claim` refuses when another agent marked the folder active in the last 12 hours. After 12 quiet hours, with a clean tree and no newer commit, the lock is stale and claim takes it. Say so in the note.

Before merge, `pnpm run worktrees -- done` deletes `AGENT_HANDOFF.md`. Commit that deletion. The note should not sit on `main`.

## When the chat runs out of tokens

Follow `AGENTS.md` under "Keep work resumable" and "Recover when a bot has already stopped". Save progress after each meaningful result, not only when a chat is almost full. Grok's usage allowance may stop all its bots at once, so recovery must work without asking any of them for a final message.

For coding, update `AGENT_HANDOFF.md`, inspect the diff for unrelated work and secrets, then commit and push the task's files. Use `[skip ci]` for unfinished checkpoints. Do not open a pull request solely for a checkpoint; the finished pull request needs the required checks without that marker.

If a chat has already stopped, inspect the same worktree, diff, recent commits, remote branch, and existing task record. Respect the ownership and claim rules above. Reconstruct the next step from evidence and continue authorized work in an available agent. Do not blindly commit everything in the folder or require Savannah to obtain a handoff from an unavailable bot.

Local edits may still be in the worktree. Cloud work may have saved artifacts even without a push. Check before declaring anything lost, and restart only what cannot be recovered. Approval boundaries still apply.

Only one worktree runs the app at a time. They share port 5177.

## What the agent may use

Do not ask for an API key. Use the connector. If the connector has no access, read `.env` in the main checkout. Do not print it. If both are missing, open that product's login. The accounts are `savblack` on GitHub (`savblack/PLOT` only), `sav.black@outlook.com`, `savannah@theplot.tv`, Supabase `PLOT Staging` unless production was explicitly requested, the PostHog project named Plot, and Linear workspace `savblack` team PLO.

GitHub, Node, and pnpm are machine-wide. Cursor, Claude Code, and Codex each have their own "allow this command" switch. Turn on test and lint once in each app. Git cannot do that click.

Merging `main`, production database writes, deploys, and public posts still wait for a yes.

## Disk and chats

`pnpm run agent-disk` prints the size of the pnpm store, Playwright, Claude and Codex chats, Cursor's local chat storage, and Xcode's build output. Finder counts pnpm's shared files once per folder. The command uses `du`, which counts each file once.

Pass `--apply` to delete Claude and Codex chat files older than 14 days. Cursor's chat storage is listed and not deleted. Quit Cursor before removing that folder by hand. Pass `--apply --xcode` to delete DerivedData, simulators, and iOS device support. Those take a long time to rebuild.

Cloud chats (Cursor cloud, Manus, grok.com) are not on this Mac. Archive those in the product.

A local model is the wrong tool for this cleanup. The script already knows the rules.

## Checks, and a second reader

CI tiers are in [actions-minutes.md](actions-minutes.md). A work-in-progress push that only exists so a cloud agent can resume should say `[skip ci]` in the commit message. Open one pull request when the task is ready.

Greptile is turned off. Do not ask it to review a pull request, and do not mention @greptile. Do not run a reviewer inside GitHub Actions or CircleCI.

## Cursor Automations

Cursor Automations are cloud agents. They do not see `~/Developer`. They see the git branch, the same way any other cloud agent does. A draft pull request can start one on "draft opened". A later push can start it again. If the automation then pushes its own commit, CircleCI runs again. A docs-only halt still counts as CI finished, so a "CI completed" trigger will fire even when the suite stopped early.

Keep an automation that reviews this repo as comments only. Do not let it approve, merge, or open a second pull request for a task that already has one. Do not trigger it on every push and on CI completed for the same pull request. That pair spends a cloud-agent run twice, and a fix commit spends a third CircleCI run.

Bugbot and the security reviewer on the Automations page are billed as cloud-agent usage. Leave them off unless you meant to pay for that review. If one is already on, it should not push fixes onto the same branch.

The worktree list already includes remote branches named `agent/` and `cursor/`. An automation that uses another prefix will not show up until the list is widened.

For a permission change, a billing change, or a migration, the agent who wrote it asks a different agent you already use to read the diff before the pull request opens. Ordinary docs skip that.

## Not in this change

GitHub schedules that duplicate CircleCI are still on. Remove one only after the CircleCI run of that job has succeeded. The weekly marketing batch stays on the GitHub Mac runner until a Saturday of copy from the coding Grok agent has been compared with it. That agent's assignment is `marketing/copy/GROK-HANDOFF.md`. It does not run the weekly command. Alix does not write this comparison. A second run of the weekly command would book the same week twice.
