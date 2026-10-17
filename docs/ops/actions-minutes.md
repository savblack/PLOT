# CI minutes

Required pull-request and `main` validation runs on CircleCI. Scheduled compute,
including backups, publishing and data refreshes, is also defined there. GitHub
Actions is reserved for deployment monitoring and automation that depends on
GitHub events or `GITHUB_TOKEN`. The Claude-backed weekly marketing batch remains
on GitHub Actions until a suitable Codex credential is available for CircleCI.

## Migration, 2026-09-19

The former `.github/workflows/ci.yml` duplicated the full suite on every PR and
every push to `main`, even after `.circleci/config.yml` was introduced. It was
removed once CircleCI was configured to run on PR opens and updates plus default
branch pushes. The obsolete post-merge CircleCI trigger was disabled because it
ran after automatic branch deletion and could not check out the PR head.

The scheduled jobs use the `task` pipeline parameter in `.circleci/config.yml`.
Create one CircleCI schedule trigger for each row below, targeting `main` and
passing the listed value as `task`. CircleCI schedules are configured in its UI,
not embedded in the config for this GitHub App project.

| Schedule (UTC) | `task` |
| --- | --- |
| `0 2 * * *` | `marketing-reconcile` |
| `30 12 * * 3` | `streaming-top10` |
| `0 12 * * *` | `netflix-top10` |
| `23 */6 * * *` | `broadcast-guide` |
| `17 3 * * *` | `db-backup` |
| `47 3 * * 0` | `storage-backup` |
| `25 6 * * *` | `db-write-paths` |

Before enabling those triggers, create the restricted CircleCI context
`plot-production-schedules` and add these variables to it. Do not use project
environment variables: those would also be injected into untrusted PR builds.
Values come from the same-named GitHub Actions secret or variable;
GitHub never reveals an existing secret value, so they must be copied from the
original password-manager/provider record.

- Shared: `SUPABASE_URL` (GitHub's `VITE_SUPABASE_URL`),
  `SUPABASE_SERVICE_ROLE_KEY`, `MARKETING_ADMIN_EMAIL`, `RESEND_API_KEY`.
- Marketing: `BUFFER_API_KEY`, `TMDB_API_KEY`, `OMDB_API_KEY`.
- Charts: `MOVIEOFTHENIGHT_API_KEY`, `RAPIDAPI_KEY`, `CHART_REGIONS`,
  `CHART_MIN_USERS`.
- Database and backups: `SUPABASE_DB_URL`, `BACKUP_GPG_PASSPHRASE`,
  `R2_ENDPOINT`, `R2_BUCKET`, `AWS_ACCESS_KEY_ID` (GitHub's
  `R2_ACCESS_KEY_ID`), `AWS_SECRET_ACCESS_KEY` (GitHub's
  `R2_SECRET_ACCESS_KEY`).

Keep each GitHub schedule enabled until its matching CircleCI task has completed
successfully once. Then remove only the `schedule` stanza from the GitHub file;
retain `workflow_dispatch` as a manual recovery path. This prevents a credential
or scheduler mistake from creating a silent backup or publishing gap.

GitHub billing reference:
https://docs.github.com/en/billing/reference/actions-runner-pricing

## How much of the suite runs

`scripts/ci-tier.mjs` prints `none`, `fast`, or `full` from the diff against `origin/main`. CircleCI stops before install on `none`. `fast` runs lint, unit tests, the contract checks, the production build, and the mobile typecheck. `full` adds the web Storybook build, Storybook interaction tests, and Playwright.

| Tier | When | What runs |
| --- | --- | --- |
| `none` | `docs/**`, root `*.md`, and `marketing/**/*.md` only | Secret scan, then stop |
| `fast` | Everything else that is not visual, including `packages/core`, Supabase, and scripts | Lint, tests, contract checks, build, mobile typecheck |
| `full` | `apps/web`, `apps/website`, `apps/mobile`, `packages/ui`, token files, `*.stories.*`, a `full-ci` label, or `[full-ci]` in the commit message | Fast, plus web Storybook, interaction tests, and Playwright |

Website and mobile Storybook builds run only when their own story files change. Chromatic runs on `main` when the tier is `full`, and on a pull request when the diff touches stories, web CSS, or `packages/ui`, or the commit contains `[visual]`, or the PR has the `visual` label. A label is read only when `gh` has a token. `[full-ci]` and `[visual]` in the commit message work without one.

A commit message containing `[skip ci]` still skips the CircleCI pipeline entirely. Use that for a work-in-progress push that exists only so a cloud agent can resume. Do not open a pull request for that push.

A Cursor Automation that only comments does not change the tier. One that pushes a commit starts a new CircleCI run, classified from that new diff. A trigger on "CI completed" still fires when a docs-only job halted after the secret scan.

GitHub schedules that duplicate a CircleCI task are still in the workflow files. Remove a `schedule` stanza only after that CircleCI task has succeeded once. Leave `workflow_dispatch`. The weekly marketing batch stays on the GitHub macOS runner until a Saturday of copy from the coding Grok agent has been compared with it. That agent's assignment is `marketing/copy/GROK-HANDOFF.md`. It downloads the run's artifact and runs `node marketing/copy/check.mjs` once. It does not run the weekly command. Alix does not write this comparison. This schedule stays on.

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
