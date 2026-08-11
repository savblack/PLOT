# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.
For PLOT that is `savblack/PLOT`.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

**Live map for the relaunch effort: [Map: PLOT relaunch](https://github.com/savblack/PLOT/issues/474).**
Start there rather than creating a second map for the same effort.

- **Map**: a single issue labelled `wayfinder:map`, holding the Destination / Notes /
  Decisions-so-far / Not-yet-specified / Out-of-scope body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue attached to the map as a GitHub sub-issue. Both sub-issues and
  native dependencies are enabled on this repo, so use them rather than the task-list fallback:
  `gh api --method POST repos/savblack/PLOT/issues/<map>/sub_issues -F sub_issue_id=<child-db-id>`.
  Labels: `wayfinder:<type>` (`research` / `prototype` / `grilling` / `task`).
- **Blocking**: GitHub's native issue dependencies, which render the frontier visually in the
  tracker UI. `gh api --method POST repos/savblack/PLOT/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  The blocker id is its numeric **database id** (`gh api repos/savblack/PLOT/issues/<n> --jq .id`),
  not the `#number` and not the `node_id`. Read the live gate from
  `issue_dependencies_summary.blocked_by`, which counts open blockers only.
- **Frontier query**: the map's open children with no open blocker and no assignee; first in map
  order wins.
- **Claim**: `gh issue edit <n> --add-assignee savblack` — the session's first write, before any work.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a
  one-line gist plus link to the map's Decisions-so-far.

**Caveat specific to this repo**: every token in use here authenticates as `savblack`, including
agents and automation. An assignee therefore does not tell you *which* session claimed a ticket,
and a close event attributed to `savblack` may not have been a human. Check the timeline before
concluding someone deliberately closed something.

## Related

Research notes produced by `/research` live in `docs/research/`.
