#!/usr/bin/env bash
# Retire the legacy service_role JWT.
#
# WHY: `supabase_functions.http_request` takes the Authorization header as a
# literal trigger argument, so two database webhooks stored the live
# full-privilege service_role key (valid until 2036) in their trigger DDL. It was
# therefore inside every pg_dump and every nightly R2 backup artifact. PR #541
# moves the triggers to Vault, which stops new copies being made. It does NOT
# invalidate the copies already taken — only disabling legacy JWT keys does that.
# That is what this script walks you through.
#
# This script performs NO destructive action itself. Every step that changes a
# credential is printed for you to run or click; the script's job is to keep the
# order right and to verify each step before you move past it. The order matters:
# rotate before #541 lands and the next backup captures the NEW key too.
#
# Prerequisites: gh (authenticated), curl, python3, and SUPABASE_ACCESS_TOKEN in
# the repo .env. Run from the MAIN checkout, not a worktree.
set -uo pipefail

PROD_REF=mkegtssedjyqldysvzga
STAGING_REF=uzrhfivnhdcfieuaxzip

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }
bad()  { printf '\033[31m  ✗ %s\033[0m\n' "$*"; }
rule() { printf '\n%s\n' "────────────────────────────────────────────────────────────"; }

pause() {
  printf '\n'
  read -r -p "Press Enter when done, or Ctrl-C to stop here: " _
}

confirm() {
  local answer
  read -r -p "$1 [y/N] " answer
  [[ "$answer" == [yY] ]]
}

if [ ! -f .env ]; then
  bad "No .env in $(pwd) — run this from the main checkout."
  exit 1
fi
set -a; . ./.env; set +a
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN missing from .env}"

api() { # api <ref> <path>
  curl -s -m 30 -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    "https://api.supabase.com/v1/projects/$1$2"
}

legacy_enabled() { # legacy_enabled <ref> -> prints true/false/unknown
  api "$1" /api-keys/legacy | python3 -c '
import sys,json
try: print(str(json.load(sys.stdin).get("enabled")).lower())
except Exception: print("unknown")'
}

has_secret_key() { # has_secret_key <ref>
  api "$1" /api-keys | python3 -c '
import sys,json
try: d=json.load(sys.stdin)
except Exception: raise SystemExit(1)
raise SystemExit(0 if any(k.get("type")=="secret" for k in d) else 1)'
}

dbq() { # dbq <ref> <sql> -> raw JSON rows
  curl -s -m 40 -X POST \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$2")" \
    "https://api.supabase.com/v1/projects/$1/database/query"
}

# Is the credential still embedded in the webhook trigger DDL?
#
# Asks the live schema rather than inferring from git. An earlier version of this
# script grepped `git log` for the migration name, which silently reported the
# wrong answer once the PR was squash-merged under an unrelated subject — and
# would have been the wrong question anyway: what matters is whether the
# migration APPLIED, and migrations here can fail silently behind a green merge.
#
# Selects booleans only. pg_get_triggerdef would echo the embedded key verbatim
# if the old definition is still in place, so it is tested with LIKE, never
# returned.
schema_clean() { # schema_clean <ref> -> prints clean | leaking | unknown
  local sql="select count(*) filter (where pg_get_triggerdef(t.oid) like '%Bearer%') as leaking,
                    count(*) as total
               from pg_trigger t
              where t.tgname in ('on_feedback_insert','profiles-changed-brevo-sync')
                and not t.tgisinternal;"
  dbq "$1" "$sql" | python3 -c '
import sys,json
try: d=json.load(sys.stdin)
except Exception: print("unknown"); raise SystemExit
if isinstance(d,dict) or not d: print("unknown"); raise SystemExit
r=d[0]
if int(r.get("total") or 0)==0: print("unknown")
else: print("leaking" if int(r.get("leaking") or 0)>0 else "clean")'
}

rule
bold "Step 0 — where things stand"
for ref in "$PROD_REF" "$STAGING_REF"; do
  label=$([ "$ref" = "$PROD_REF" ] && echo Production || echo Staging)
  printf '  %-11s %s  legacy JWT keys enabled = %s\n' "$label" "$ref" "$(legacy_enabled "$ref")"
  if has_secret_key "$ref"; then ok "$label has an sb_secret_* key to rotate to"
  else bad "$label has NO secret key — create one in the dashboard first"; fi
done

printf '\n'
for ref in "$PROD_REF" "$STAGING_REF"; do
  label=$([ "$ref" = "$PROD_REF" ] && echo Production || echo Staging)
  case "$(schema_clean "$ref")" in
    clean)
      ok "$label: no credential in the webhook trigger DDL — new backups are clean" ;;
    leaking)
      bad "$label: the trigger DDL STILL embeds the key."
      echo "    Every nightly backup keeps capturing it. Rotating is still correct —"
      echo "    the new key never enters the schema — but the #541 migration needs to"
      echo "    apply before this is actually over. Check the Supabase deploy status." ;;
    *)
      warn "  ? $label: could not read the trigger definitions."
      echo "    Verify by hand before trusting the rest of this run." ;;
  esac
done

rule
bold "Step 1 — copy the new secret key (dashboard, both projects)"
cat <<TXT

  Production: https://supabase.com/dashboard/project/$PROD_REF/settings/api-keys
  Staging:    https://supabase.com/dashboard/project/$STAGING_REF/settings/api-keys

  Copy each project's 'default' SECRET key (starts sb_secret_). Keep them
  separate — Production's key must never be set on Staging or vice versa.

  Do not paste either key into this terminal, a file in the repo, or a commit.
TXT
pause

rule
bold "Step 2 — set SB_SECRET_KEY on the Edge Functions (both projects)"
cat <<TXT

  Every function now reads the key through _shared/serviceKey.ts, which prefers
  SB_SECRET_KEY and falls back to SUPABASE_SERVICE_ROLE_KEY. So this step is
  additive: nothing breaks while both exist.

  Production:
    npx supabase secrets set SB_SECRET_KEY=<prod sb_secret_...> --project-ref $PROD_REF

  Staging:
    npx supabase secrets set SB_SECRET_KEY=<staging sb_secret_...> --project-ref $STAGING_REF

  Then redeploy the functions so they pick it up:
    npx supabase functions deploy --project-ref $PROD_REF
TXT
pause
for ref in "$PROD_REF" "$STAGING_REF"; do
  label=$([ "$ref" = "$PROD_REF" ] && echo Production || echo Staging)
  if api "$ref" /secrets | grep -q 'SB_SECRET_KEY'; then ok "$label: SB_SECRET_KEY is set"
  else bad "$label: SB_SECRET_KEY not found — set it before continuing"; fi
done

rule
bold "Step 3 — swap the GitHub Actions secret"
cat <<TXT

  Five workflows and several scripts read this. They take the value from the
  repo secret, so no code change is needed — only the value.

    gh secret set SUPABASE_SERVICE_ROLE_KEY --body '<prod sb_secret_...>'

  (Paste at the prompt instead if you would rather it stay out of shell history:
    gh secret set SUPABASE_SERVICE_ROLE_KEY )
TXT
pause
gh secret list 2>/dev/null | grep -q 'SUPABASE_SERVICE_ROLE_KEY' \
  && ok "SUPABASE_SERVICE_ROLE_KEY exists (updated timestamp: $(gh secret list 2>/dev/null | awk '/SUPABASE_SERVICE_ROLE_KEY/{print $2}'))" \
  || bad "secret missing"

rule
bold "Step 4 — update the Vault secrets that hold the key"
cat <<TXT

  Two Vault secrets carry this key, and they are easy to miss because they live
  in the database rather than in any settings page. In the SQL editor:

    -- used by the #541 webhook triggers (feedback, profiles→Brevo)
    select vault.update_secret(
      (select id from vault.secrets where name = 'edge_webhook_bearer'),
      '<sb_secret_...>');

    -- used by supabase/notify-signup-trigger.sql, if you installed it
    select vault.update_secret(
      (select id from vault.secrets where name = 'notify_signup_service_role_key'),
      '<sb_secret_...>');

  Run against Production, and against Staging if the secrets exist there.
TXT
pause

rule
bold "Step 5 — verify BEFORE disabling anything"
cat <<TXT

  This is the step that decides whether Step 6 is safe. Legacy keys are still
  enabled, so anything still on the old key will keep working here and hide a
  problem — check the paths that actually exercise the new key:

  1. Submit feedback in the app  → the notify-feedback webhook fires (Step 4's
     edge_webhook_bearer). Check Logs → notify-feedback for a 200.
  2. Change a profile field      → profiles-changed / Brevo sync fires.
  3. Trigger one workflow that uses the Actions secret:
       gh workflow run netflix-top10.yml
       gh run watch
  4. Hit one deployed function that uses adminClient(), e.g. the calendar feed.

  Check function logs for 401s:
    https://supabase.com/dashboard/project/$PROD_REF/logs/edge-functions
TXT
pause
if confirm "Did every check in Step 5 pass?"; then
  ok "Proceeding to the irreversible step."
else
  warn "Stopping here. Nothing is broken: both keys still work."
  echo "  Fix what failed, then re-run this script."
  exit 0
fi

rule
bold "Step 6 — disable legacy JWT keys (this is the step that closes the leak)"
cat <<TXT

  Until now nothing has been invalidated. This is what makes the key inside the
  old backup artifacts useless.

  Do STAGING FIRST and re-run Step 5's checks against it. Local dev points at
  Staging, so if something was missed you will see it there rather than in
  production.

    Staging:    https://supabase.com/dashboard/project/$STAGING_REF/settings/api-keys
    Production: https://supabase.com/dashboard/project/$PROD_REF/settings/api-keys

  → 'Legacy API keys' → Disable.

  ROLLBACK: re-enable legacy keys on the same screen. The fallback in
  serviceKey.ts means the old key resumes working immediately; nothing needs
  redeploying. That is the whole reason the fallback is there.
TXT
pause
for ref in "$STAGING_REF" "$PROD_REF"; do
  label=$([ "$ref" = "$PROD_REF" ] && echo Production || echo Staging)
  state="$(legacy_enabled "$ref")"
  if [ "$state" = "false" ]; then ok "$label: legacy keys DISABLED — leaked copies are now inert"
  else bad "$label: legacy keys still enabled (state=$state)"; fi
done

rule
bold "Step 7 — clean up what is left"
cat <<TXT

  1. The R2 artifacts still contain the old key. It is inert now, but there is no
     reason to keep them. They age out on the 30-day prune, or delete the
     pre-rotation ones:
       aws s3 ls "s3://\$R2_BUCKET/db-backups/" --endpoint-url "\$R2_ENDPOINT"

  2. Update the local .env's service key so scripts run from your machine work.

  3. Once every consumer is confirmed on SB_SECRET_KEY, the fallback in
     _shared/serviceKey.ts can go, and SUPABASE_SERVICE_ROLE_KEY can be dropped
     from the Actions secrets. Leave the fallback until then — it is the rollback.

  4. Consider whether the auth JWT secret needs rotating too. It does NOT here:
     disabling legacy keys is enough, and rotating the JWT secret would sign
     every user out.
TXT

rule
bold "Done."
echo "Rotation state:"
for ref in "$PROD_REF" "$STAGING_REF"; do
  label=$([ "$ref" = "$PROD_REF" ] && echo Production || echo Staging)
  printf '  %-11s legacy enabled = %s\n' "$label" "$(legacy_enabled "$ref")"
done
