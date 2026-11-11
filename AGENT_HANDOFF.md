# PostHog error spike alert

Plot now emails Savannah when 3 or more people hit an app error on the same day.
The alert lives in PostHog, not in code. Savannah approved creating it on 2026-11-11.
Nothing left for her to do except review the PR.

Status: active
Owner: Jacob (CTO) area; done by a Claude Code side session
Branch: agent/2026-11-11-posthog-error-spike-alert
Worktree: ~/Developer/PLOT-worktrees/2026-11-11-posthog-error-spike-alert
Updated: 2026-11-11

## Done

- PostHog project Plot (471234), account sav.black@outlook.com:
  - insight 13949841 / `x5mggkz6` "App errors: people affected daily"
  - alert 01a1c9af-1dda-0000-0fd7-ee9f0b2494c1 "App errors affect 3+ people in a day",
    hourly, upper bound 2, emails sav.black@outlook.com
- Test: bar set to fire at 1+, alert fired 2026-11-11T08:17:49Z and emailed
  (check 01a1c9af-44ab-...), then bar restored to 3+ (state back to Not firing).
- docs/ops/monitoring.md: new "App errors (PostHog alert)" section; item removed
  from "Not watched yet".

## Next

Open the PR (docs only). Delete this file in the last commit before merge.

## Approvals

- Given: create the insight and alert, one test email.
- Still needed: merge.
