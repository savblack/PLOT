#!/usr/bin/env bash
# Open or close the `incident` issue for one scheduled job.
#
# WHY: five scheduled workflows (db-write-paths, migration-drift, netflix-top10,
# streaming-top10, broadcast-guide) failed with nothing but a red X in the
# Actions tab, which nobody reads. The two-week `history` outage in July 2026
# went unnoticed for exactly that reason. This gives each of them the same
# open-on-failure, close-on-recovery issue supabase-deploy-guard.yml uses.
#
# One open issue per job, found by exact title. A repeat failure comments on it
# rather than opening another, and the next green run closes it, so an open
# incident always means "still broken" and the next failure opens a fresh one.
#
# Usage:  job-incident.sh open|close
# Inputs (env): GH_TOKEN, GITHUB_REPOSITORY, JOB_NAME, RUN_URL,
#               FAILURE_NOTE (optional, open only: what the failure means)
# Output: `opened=true|false` to $GITHUB_OUTPUT (when set). `true` only when this
#         call created a new issue, so callers can email once per incident
#         instead of once per failed run.
#
# The repository is public, so the issue says which job failed and links the
# run. It never quotes logs: those can carry connection errors with hostnames.
set -euo pipefail

mode="${1:?usage: job-incident.sh open|close}"
: "${JOB_NAME:?JOB_NAME is required}"
: "${RUN_URL:?RUN_URL is required}"

label='incident'
title="Scheduled job failing: ${JOB_NAME}"

emit() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "$1" >> "$GITHUB_OUTPUT"; fi
}
emit 'opened=false'

# Exact-title match: `--search` is fuzzy and would let one job's issue be
# mistaken for another's.
existing=$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --label "$label" \
  --limit 100 --json number,title \
  | jq -r --arg t "$title" '[.[] | select(.title == $t)][0].number // ""')

case "$mode" in
  open)
    gh label create "$label" --repo "$GITHUB_REPOSITORY" \
      --color 'b60205' \
      --description 'A scheduled job or production check is failing' \
      2>/dev/null || true

    body=$(
      printf '%s\n' \
        "The scheduled job **${JOB_NAME}** failed." \
        '' \
        "${FAILURE_NOTE:-}" \
        '' \
        "[Open the failed run](${RUN_URL}) for the log." \
        '' \
        'This issue closes itself the next time the job succeeds, so while it is open' \
        'the job is still broken. A later failure adds a comment here instead of' \
        'opening a second issue.'
    )

    if [ -n "$existing" ]; then
      gh issue comment "$existing" --repo "$GITHUB_REPOSITORY" \
        --body "Failed again: [run](${RUN_URL})."
      echo "Commented on open incident #${existing}."
    else
      url=$(gh issue create --repo "$GITHUB_REPOSITORY" \
        --title "$title" --label "$label" --body "$body")
      echo "Opened incident: ${url}"
      emit 'opened=true'
    fi
    ;;
  close)
    if [ -z "$existing" ]; then
      echo "No open incident for ${JOB_NAME}."
      exit 0
    fi
    gh issue comment "$existing" --repo "$GITHUB_REPOSITORY" \
      --body "Recovered: [this run](${RUN_URL}) succeeded. Closing so the next failure opens its own issue."
    gh issue close "$existing" --repo "$GITHUB_REPOSITORY"
    echo "Closed incident #${existing}."
    ;;
  *)
    echo "Unknown mode: ${mode} (expected open or close)" >&2
    exit 2
    ;;
esac
