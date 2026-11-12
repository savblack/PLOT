# Remove no-card claims from Plot copy

Status: active
Owner: Codex (Alix website copy, Kaia trial copy)
Branch: agent/2026-11-12-trial-card-copy
Worktree: /Users/savannahblack/Developer/PLOT-worktrees/2026-11-12-trial-card-copy
Updated: 2026-11-12 (Australia/Sydney)
Latest pushed commit: 8fce03a20 (checkpoint, [skip ci])

## Goal
Remove no-credit-card wording from the website and app so it does not imply that Premium's seven-day trial starts without a payment card.

## Completed
- Removed the website hero claim and other no-card wording from About and pricing HTML, with their copy catalogs kept in sync.
- Replaced the web app's Free-plan "No card needed" label in shared plan copy with "Free plan, always".
- Confirmed no remaining `no credit card`, `no card needed`, `no card required`, or `noCard` references in website, web app, or shared copy.
- `pnpm run csp` produced no change. `pnpm run check` passed on Node 25.7.0 (CI uses Node 22); existing mobile lint warnings appeared.
- `git diff --check` passed. No secrets or unrelated source edits found.

## Next
Create a finished PR with a normal CI-running commit and review the PR checks. Remove this handoff in the last commit before merge. Do not merge or deploy without Savannah's approval under AGENTS.md Decisions.

## Approvals
Savannah authorized this copy change in chat on 2026-11-12. Production publication or merge approval remains outstanding.
