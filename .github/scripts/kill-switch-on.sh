#!/usr/bin/env bash
# Turns ONE kill switch on (hides that feature in the web app), and only on.
# Run by .github/workflows/kill-switch.yml so the fix agent never holds the
# PostHog key. There is deliberately no way to turn a switch off here: a
# person brings a feature back, in PostHog, once the fix is live.
#
# Inputs (env):
#   SWITCH          flag key; must be one of the keys in FLAG_IDS below
#   ISSUE           GitHub issue number. Required for real switches: it must be
#                   an OPEN issue labelled `incident`. Optional for the drill.
#   POSTHOG_KEY     personal API key scoped to feature_flag:write on 471234
#   GH_TOKEN, REPO  for reading the issue and commenting on it
#   ACTOR, RUN_URL  for the log line and the comment
# Writes `summary`, `subject` and `body` to $GITHUB_OUTPUT for the email step.
set -euo pipefail

PROJECT=471234
API="https://us.posthog.com/api/projects/${PROJECT}/feature_flags"

# Key -> PostHog flag id. Fixed here so a typo or a crafted input can never
# reach any other flag. kill-switch-drill is a practice flag the app never
# reads; it exists so this workflow can be tested without hiding anything.
declare -A FLAG_IDS=(
  [kill-watch-together]=1067766
  [kill-pricing-page]=1067767
  [kill-apple-login]=1067768
  [kill-google-login]=1067770
  [kill-switch-drill]=1071543
)
declare -A HIDES=(
  [kill-watch-together]='Watch together, shared lists and the Together nav item'
  [kill-pricing-page]='the pricing page (/pricing and /plans send people to /app)'
  [kill-apple-login]='the "Continue with Apple" button (email sign-in stays)'
  [kill-google-login]='the "Continue with Google" button'
  [kill-switch-drill]='nothing (practice switch, the app never reads it)'
)

fail() { echo "::error::$1"; exit 1; }

[[ -n "${POSTHOG_KEY:-}" ]] || fail "POSTHOG_KILL_SWITCH_KEY secret is not set."
id="${FLAG_IDS[$SWITCH]:-}"
[[ -n "$id" ]] || fail "'$SWITCH' is not a kill switch this workflow may turn on."

issue="${ISSUE:-}"
if [[ -n "$issue" ]]; then
  [[ "$issue" =~ ^[0-9]+$ ]] || fail "Issue must be a number."
  info=$(gh api "repos/${REPO}/issues/${issue}") || fail "Issue #${issue} not found."
  state=$(jq -r '.state' <<<"$info")
  is_incident=$(jq -r '[.labels[].name] | index("incident") != null' <<<"$info")
  if [[ "$SWITCH" != "kill-switch-drill" ]]; then
    [[ "$state" == "open" ]] || fail "Issue #${issue} is not open."
    [[ "$is_incident" == "true" ]] || fail "Issue #${issue} is not labelled incident."
  fi
elif [[ "$SWITCH" != "kill-switch-drill" ]]; then
  fail "A real switch needs the open incident issue it is for."
fi

auth=(-H "Authorization: Bearer ${POSTHOG_KEY}")

# Read first: confirm the id still belongs to this key, and that the release
# condition is still everyone at 100% (the app reads with one fixed id, so a
# targeted or partial rollout would not do what it says).
flag=$(curl -sS --fail-with-body "${auth[@]}" "${API}/${id}/") || fail "Could not read the flag from PostHog: ${flag:-no response}"
[[ "$(jq -r '.key' <<<"$flag")" == "$SWITCH" ]] || fail "Flag ${id} is no longer ${SWITCH}. Update FLAG_IDS."
was_active=$(jq -r '.active' <<<"$flag")

if [[ "$was_active" == "true" ]]; then
  result="was already on. Nothing changed."
else
  updated=$(curl -sS --fail-with-body -X PATCH "${auth[@]}" -H 'Content-Type: application/json' \
    -d '{"active": true}' "${API}/${id}/") || fail "PostHog refused the change: ${updated:-no response}"
  [[ "$(jq -r '.active' <<<"$updated")" == "true" ]] || fail "PostHog did not report the switch as on."
  result="is now ON."
fi

rollout=$(jq -c '[.filters.groups[] | {p: (.properties | length), r: .rollout_percentage}]' <<<"$flag")
note=""
[[ "$rollout" == '[{"p":0,"r":100}]' ]] || note=" Warning: its release condition is not plain 100% for everyone (${rollout}), so it may not reach every visitor."

when=$(date -u +%Y-%m-%dT%H:%M:%SZ)
summary="Kill switch ${SWITCH} ${result} It hides ${HIDES[$SWITCH]}.${note}"
echo "KILL-SWITCH-LOG ${when} switch=${SWITCH} flag_id=${id} was_active=${was_active} issue=${issue:-none} actor=${ACTOR} run=${RUN_URL}"
echo "$summary"

off="To bring the feature back once the fix is live: PostHog, project Plot, Feature flags, ${SWITCH}, switch it off. Automation can never do that part."
if [[ -n "$issue" ]]; then
  gh api "repos/${REPO}/issues/${issue}/comments" -f body="${summary}

Turned on by ${ACTOR} at ${when} ([workflow run](${RUN_URL})).

${off}" >/dev/null
fi

esc() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
body="$(esc <<<"$summary") Requested by $(esc <<<"$ACTOR")${issue:+ for issue #${issue}}.</p><p>$(esc <<<"$off")"
{
  echo "summary=${summary}"
  echo "subject=Plot: kill switch ${SWITCH} ${result%%.*}"
  echo "body<<EOF"; echo "$body"; echo "EOF"
} >> "$GITHUB_OUTPUT"
