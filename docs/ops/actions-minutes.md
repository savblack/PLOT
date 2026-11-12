# CI minutes

Required pull-request and `main` validation runs on CircleCI. Scheduled jobs
(backups, publishing, data refreshes, the write-path check) run on GitHub
Actions in `.github/workflows`, which is also where their failure alerts live.
GitHub Actions also runs deployment monitoring and automation that depends on
GitHub events or `GITHUB_TOKEN`.

## Migration, 2026-09-19

The former `.github/workflows/ci.yml` duplicated the full suite on every PR and
every push to `main`, even after `.circleci/config.yml` was introduced. It was
removed once CircleCI was configured to run on PR opens and updates plus default
branch pushes. The obsolete post-merge CircleCI trigger was disabled because it
ran after automatic branch deletion and could not check out the PR head.

## Scheduled jobs stay on GitHub, 2026-11-12

The September plan moved scheduled jobs to CircleCI behind a `task` pipeline
parameter, but the CircleCI schedule triggers were never created: on
2026-11-12 the project's only trigger was "All pushes on PLOT", and every
`main` pipeline had been started by a push. The GitHub workflows were the only
copies that ever ran. Before that was checked, the plan's instruction to
"remove the GitHub schedule once CircleCI has succeeded" would have stopped the
nightly backup.

So the unused CircleCI jobs, the `task` parameter, the `alert_on_failure`
command and the `plot-production-schedules` context references were removed
from `.circleci/config.yml`. Each scheduled job has one home, on GitHub, with
the `incident` issue and email alerting. If GitHub Actions minutes ever become
a problem, moving a job back means creating the CircleCI schedule and context
first, and confirming a scheduled run succeeded, before touching the GitHub file.


GitHub billing reference:
https://docs.github.com/en/billing/reference/actions-runner-pricing

## How much of the suite runs

`scripts/ci-tier.mjs` prints `none`, `fast`, or `full` from the diff against `origin/main`. CircleCI stops before install on `none`. `fast` runs lint, unit tests, the contract checks, the production build, and the mobile typecheck. `full` adds the web Storybook build, Storybook interaction tests, and Playwright.

| Tier | When | What runs |
| --- | --- | --- |
| `none` | `docs/**`, root `*.md`, and `marketing/**/*.md` only | Secret scan, then stop |
| `fast` | Everything else that is not visual, including `packages/core`, Supabase, and scripts | Lint, tests, contract checks, build, mobile typecheck |
| `full` | `apps/web`, `apps/website`, `apps/mobile`, `packages/ui`, token files, `*.stories.*`, a `full-ci` label, or `[full-ci]` in the commit message | Fast, plus web Storybook, interaction tests, and Playwright |

Website and mobile Storybook builds run only when their own story files change. Chromatic was removed on 2026-11-12. A `full-ci` PR label is read only when `gh` has a token. `[full-ci]` in the commit message works without one.

A commit message containing `[skip ci]` still skips the CircleCI pipeline entirely. Use that for a work-in-progress push that exists only so a cloud agent can resume. Do not open a pull request for that push.

CircleCI project settings, Advanced, "Auto-cancel redundant workflows" is on as of October 17, 2026. An older push on the same branch stops when a newer one starts. Do not ask Savannah to turn it on again.

A Cursor Automation that only comments does not change the tier. One that pushes a commit starts a new CircleCI run, classified from that new diff. A trigger on "CI completed" still fires when a docs-only job halted after the secret scan.

Scheduled jobs live only in `.github/workflows` (see above). The weekly marketing batch stays on the GitHub macOS runner until a Saturday of copy from the coding Grok agent has been compared with it. That agent's assignment is `marketing/copy/GROK-HANDOFF.md`. It downloads the run's artifact and runs `node marketing/copy/check.mjs` once. It does not run the weekly command. Alix does not write this comparison. This schedule stays on.

## Guardrails

- PRs and `main` pushes run CircleCI at the tier above. A docs-only push does not install or build. An app change on `main` still runs the full tier, because that push deploys.
- Dependabot and timeline-refresh automerge workflows listen only for the
  successful `ci/circleci: check` commit status and re-resolve the exact open PR
  by the tested commit SHA before merging.
- Backups, daily publishing reconciliation, chart refreshes and database checks
  retain their cadence through parameterised CircleCI schedule triggers. The
  weekly copy-generation workflow retains its GitHub schedule.
- Routine Actions minor/patch dependency upgrades share a Dependabot PR; major
  upgrades retain individual review.

After merging, confirm a PR update and the resulting `main` push each produce one
successful CircleCI pipeline and no GitHub Actions `CI` run. Run each scheduled
task once manually, confirm its external result (especially both R2 backup
sentinels), and only then remove the matching GitHub cron.
