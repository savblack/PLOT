#!/usr/bin/env bash
# Failure alert for marketing workflows — emails the admin via Resend.
# Inputs (env): RESEND_API_KEY, ADMIN_EMAIL, RUN_URL, WORKFLOW_NAME, FAILURE_NOTE (optional)
set -euo pipefail

payload=$(jq -n \
  --arg from "PLOT <hello@plotapp.tv>" \
  --arg to "$ADMIN_EMAIL" \
  --arg subject "PLOT marketing: ${WORKFLOW_NAME} workflow FAILED" \
  --arg html "<p>The ${WORKFLOW_NAME} run failed. ${FAILURE_NOTE:-}</p><p><a href=\"${RUN_URL}\">Open the workflow run</a></p>" \
  '{from: $from, to: [$to], subject: $subject, html: $html}')

curl -sS -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer ${RESEND_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$payload"
