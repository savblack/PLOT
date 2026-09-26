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
| `47 3 * * *` | `storage-backup` |
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

## Guardrails

- PRs and `main` pushes run the complete suite on CircleCI, including the three
  Storybook builds and Storybook interaction/accessibility tests.
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
