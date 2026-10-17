#!/usr/bin/env bash
# Failure alert for scheduled workflows — emails the admin via Resend.
# Inputs (env): RESEND_API_KEY, ADMIN_EMAIL, RUN_URL, WORKFLOW_NAME,
#               FAILURE_NOTE (optional), ALERT_SUBJECT (optional)
#
# ALERT_SUBJECT exists because this is no longer marketing-only — db-backup uses
# it too, and "Plot marketing: ... FAILED" would be actively misleading for a
# failed database backup. Omitting it keeps the original subject verbatim, so
# every existing caller is unaffected.
#
# ALERT_BODY follows the same precedent, for the same reason one step further:
# not every alert is a failed run. The queue watchdog fires on a healthy run
# that found nothing scheduled, where "The publish run failed." is simply false.
# Omitting it keeps the original sentence verbatim.
set -euo pipefail

payload=$(jq -n \
  --arg from "Plot <hello@theplot.tv>" \
  --arg to "$ADMIN_EMAIL" \
  --arg subject "${ALERT_SUBJECT:-Plot marketing: ${WORKFLOW_NAME} workflow FAILED}" \
  --arg html "<p>${ALERT_BODY:-The ${WORKFLOW_NAME} run failed. ${FAILURE_NOTE:-}}</p><p><a href=\"${RUN_URL}\">Open the workflow run</a></p>" \
  '{from: $from, to: [$to], subject: $subject, html: $html}')

# Relay body for marketing-notify: one recipient, fixed From on the function side.
relay_payload=$(jq -n \
  --arg to "$ADMIN_EMAIL" \
  --arg subject "${ALERT_SUBJECT:-Plot marketing: ${WORKFLOW_NAME} workflow FAILED}" \
  --arg html "<p>${ALERT_BODY:-The ${WORKFLOW_NAME} run failed. ${FAILURE_NOTE:-}}</p><p><a href=\"${RUN_URL}\">Open the workflow run</a></p>" \
  '{to: $to, subject: $subject, html: $html}')

post_email() {
  local url="$1"
  local auth="$2"
  local body="$3"
  local code
  code=$(curl -sS -o /tmp/plot-email-body -w '%{http_code}' -X POST "$url" \
    -H "Authorization: Bearer ${auth}" \
    -H "Content-Type: application/json" \
    -d "$body")
  if [[ "$code" == "200" || "$code" == "201" ]]; then
    return 0
  fi
  echo "Email post failed (${code}): $(head -c 300 /tmp/plot-email-body)" >&2
  return 1
}

if ! post_email "https://api.resend.com/emails" "${RESEND_API_KEY:-}" "$payload"; then
  base="${SUPABASE_URL:-}"
  base="${base%/}"
  if [[ -n "$base" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
    post_email "${base}/functions/v1/marketing-notify" "$SUPABASE_SERVICE_ROLE_KEY" "$relay_payload"
  else
    exit 1
  fi
fi
