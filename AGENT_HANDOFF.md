# silent-job-alerts

Status: paused (PR open, waiting for Savannah's review; do not merge without her yes)
Owner: Jacob (CI and reliability)
Branch: agent/2026-11-11-silent-job-alerts
Worktree: ~/Developer/PLOT-worktrees/2026-11-11-silent-job-alerts
Updated: 2026-11-11T02:35Z

## In plain words

Five automatic jobs that run on a timer (two database health checks, two
streaming chart refreshes, and the TV guide refresh) used to fail without
telling anyone. Now, when one fails, a GitHub issue labelled `incident` opens
and Savannah gets one email. If it keeps failing, the issue gets a comment
(no more emails). When it works again, the issue closes itself. Nothing for
Savannah to do except review and approve the PR.

## Done (with evidence)

- `.github/scripts/job-incident.sh`: shared open/comment/close script.
- Failure steps added to `db-write-paths.yml`, `migration-drift.yml`,
  `netflix-top10.yml`, `streaming-top10.yml`, `broadcast-guide.yml`.
- CircleCI twins (streaming-top10, netflix-top10, broadcast-guide,
  db-write-paths) get the existing `alert_on_failure` email. migration-drift
  has no CircleCI twin.
- Live test on this branch with a deliberately broken netflix-top10:
  - run 42945168589 failed, opened issue #1546, email step succeeded
  - run 42945269745 failed again, commented on #1546, email skipped
  - run 42945370841 (accidental third broken run, same result)
  - run 42945473654 after the revert succeeded and closed #1546
- `pnpm run check` passed locally (exit 0).

## Not tested before merge

- CircleCI `alert_on_failure` on the four twins: reuses the existing command
  already proven by db-backup, but schedules only run on `main`, so it was not
  fired from the branch.
- The other four GitHub workflows use the identical steps; only netflix-top10
  was broken deliberately (the others touch production databases or quotas).

## Next action

Savannah reviews the PR. Before merge, delete this file in the last commit.

## Approvals

- Given: the task brief (from the operations-automation session) to open a PR.
- Still needed: Savannah's yes to merge.
