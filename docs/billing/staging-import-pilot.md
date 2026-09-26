# Staging import pilot approval scope

Approved by Savannah and executed on 17 September 2026. See execution evidence below.

## Verified starting state

Read-only queries against PLOT Staging (`uzrhfivnhdcfieuaxzip`) found no
watch_events, imported_annotations, tracking_connections or tracking_jobs tables.
Its live can_create_custom_list() permits three Free custom lists, whereas the
agreed allowance and production function permit five. Earlier staging proofs
installed their schema only inside transactions that rolled back.

## Proposed staging-only changes

1. Apply these reviewed migrations in one transaction, recording their versions
   in the staging migration ledger and aborting on any unexpected existing object
   or version. Recheck the starting state immediately before execution:
   - 20260916140000_free_list_allowance.sql (three to five in staging only)
   - 20260916140001_watch_event_foundation.sql
   - 20260916150000_import_watch_events.sql
   - 20260916170000_episode_watch_overrides.sql
   - 20260917020000_saved_list_imports.sql
   - 20260917100000_tracking_jobs.sql
   - 20260917130000_imported_annotations.sql
2. Deploy the reviewed tmdb-proxy function to this staging project only, using
   the fixed-project staging CLI wrapper and existing server-side credentials.
   Check that staging has the required TMDB secret without printing its value.
3. Create two new, private staging-only QA accounts, with synthetic labels and
   generated passwords stored in ignored local files. Do not email anyone or
   reset/change any existing account. Use them only for synthetic/captured-source
   test imports and cross-account isolation checks.
4. Run local web and iOS builds against staging. Enable import preview flags only
   in those local builds. Exercise matching, confirmation, saved event/list/
   annotation reads, duplicate retry and the five-list boundary. Sign into the
   second account to check isolation. Leave the QA accounts identifiable for
   inspection; deletion requires separate approval.

No production migration, deployment, public flag, payment setting, automatic
sync scheduler, provider connection or outgoing sync is included. Savannah's
separate permission for Trakt/Plex flags on her own account is retained; this
staging setup does not activate that pilot or replace provider consent.

## Evidence and limits

The six additive migrations applied on a fresh temporary production copy, adding
12 functions and replacing none. The additional Free-list function was compared
with staging's live definition: the intended difference is the allowance of five.
Existing rollback-only staging proofs cover ownership and RPC behaviour.

A staging edge URL used directly by local clients verifies the staging function,
not the deployed production Cloudflare Worker route. The production Worker-to-edge
external-ID lookup must still be verified after its separately approved rollout.
This setup does not validate unverified third-party export formats or live
Trakt/Plex/Younify activity.


## Execution evidence

- Fresh preflight confirmed all seven migration versions and their new tables
  were absent; the live Free-list function still allowed three.
- All seven migrations and their ledger entries committed in one staging-only
  transaction. Schema reload was requested.
- `pnpm run edge:check` passed: 23 edge functions typechecked and 56 files linted.
- `pnpm run supabase:staging functions deploy tmdb-proxy` deployed successfully
  to the fixed staging project. Both required TMDB secrets already existed.
- Two new private synthetic QA accounts were created via the current secret key,
  then authenticated using the publishable key. Existing accounts were untouched.
  Passwords, sessions and keys are in ignored `.playwright/import-pilot/` files,
  not this report. Legacy keys are disabled; failed legacy/redacted-key attempts
  did not create accounts.
- Shared pipeline: live TMDB resolution, two persisted watch events, duplicate
  reimport, null dates, episode 2/13 and cross-account read isolation passed.
- Actual web app on local port 5179: file picker, review, confirmation and
  staging persistence passed; reload/reimport showed zero new and two duplicate
  records. No browser exceptions.
- Actual iOS ImportHistoryModal with the first staging session: IMDb CSV picker,
  live match and confirmation saved one additional event. An independent
  authenticated database read verified source rating 5 and both watch dates null.
- Five imported custom lists persisted; a sixth returned free_list_limit.
- Private episode annotation persisted, repeat skipped it, a second account
  could not read it, and the watch-event count remained unchanged.

Private executable evidence scripts: `staging-db.cjs` with `apply.sql`,
`verify-database.mjs`, `web-flow.cjs`, and `verify-persistence.mjs` under the ignored
pilot directory. Credentials must never be copied into tracked fixtures.

### Initial catalogue routing limitation (resolved 2026-09-23)

The deployed edge function requires TMDB_PROXY_SHARED_SECRET. Its value is not
locally available; secret listing reveals only its digest. No existing secret
was rotated. For runtime web/iOS tests, a loopback-only bridge on port 5190 used
the existing server-side TMDB key and fetched live catalogue responses. This
proves live matching plus real staging persistence, but does not prove the
deployed Worker-to-edge route. This was the limitation of the initial pilot.

On 2026-09-23, both an authenticated request and the exact publishable-key
headers used by core succeeded through the deployed staging Worker. The actual
web import preview then resolved its titles through that route with no local
catalogue bridge. No secret rotation or deployment was required. See the
[session and routing verification](import-verification-matrix.md#session-renewal-and-deployed-catalogue-route-2026-09-23).

Production, public flags, provider account links, automatic schedules and payment
settings were not changed. QA accounts and imported synthetic records remain in
staging for inspection.

## Provider verification preparation

After Savannah requested live Trakt/Plex verification and confirmed she has both
accounts plus access to a Plex server, the private staging Plex pilot was prepared:

- Production read-only preflight found her PLOT account, its Premium display flag,
  no Trakt/Plex credentials and no tracking-job schema. Production was unchanged.
- Eleven focused provider tests passed (pagination, rewatches, episode identity,
  rate-limit handling, selected Plex profile and worker authentication).
- Production secret-name inspection found encryption secrets but no Trakt client
  ID/client secret. Staging also lacks Trakt OAuth application credentials.
- Staging received a new Plex token encryption secret, the current staging service
  key and a one-QA-account pilot allowlist. Jobs/Plex flags are enabled; public,
  Trakt and outgoing flags remain disabled. No scheduler was installed.
- media-sync and tracking-worker deployed to staging successfully.
- QA account 1 received a synthetic one-day test billing entitlement. This is a
  staging database fixture only, with no Stripe account/subscription API call.
  A profile badge alone was insufficient: the initial start-auth call correctly
  returned premium_required, so the fixture now exercises the billing-backed RPC.
- The live Plex start-auth endpoint returned HTTP 200 and an authorization URL.
  The user-facing Plex sign-in page was opened. Authorization, server/profile
  selection, history reconciliation and disconnect are still pending.

Savannah is unsure whether PLOT has a registered Trakt application. Trakt live
verification cannot proceed until its client credentials and callback are set up.

## Fresh provider preflight, 23 September 2026

After Savannah asked specifically about TV Time, Trakt and Plex, the existing
authorised staging pilot was checked again:

- `node .playwright/import-pilot/plex-connect.mjs profiles` reached the staging
  media-sync endpoint but returned HTTP 500: the selected server is unreachable
  or denied access. This does not distinguish a powered-off server, remote-access
  routing problem or denied access. No profile was selected and no history imported.
- `node scripts/supabase-staging.mjs secrets list --output json` confirmed that
  **both TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET are absent** in PLOT Staging.
  Only name presence was reported, never secret values. The first CLI attempt
  was stopped by local telemetry-file sandbox permissions; the approved read-only
  retry succeeded. No credentials, flags or provider settings were changed.
- Live Trakt OAuth still needs the PLOT developer application's credentials and
  an approved callback. A user's ordinary Trakt login alone is insufficient.
- TV Time remains saved-file-only. Its Liberator adapter can be exercised with
  existing fixtures, but a complete authentic saved archive and the separate
  GDPR CSV representation remain unverified. Savannah already said she has no
  saved export; do not repeatedly ask for the same unavailable file.

These are current preflight results, not successful connected-account syncs.
The focused Deno provider suite (`plexTracking.test.ts`, `traktPagination.test.ts`,
`trackingWorkerAuth.test.ts`) passed seven tests. The core TV Time/Trakt import
and Trakt annotation tests were rerun separately; these use fixtures, not live
provider accounts.
Plex requires reachable authorised server access; Trakt requires app credentials.
No paid account, purchase, production deployment or account mutation was made.

### Plex connection discovery follow-up

`node .playwright/import-pilot/plex-connect.mjs sources` returned HTTP 200 and
one advertised server. This proves account/resource discovery, not server
reachability or profile access. Profile discovery's prior unreachable/denied
result is still unresolved.

Code inspection found that `plexServerRequest` sliced the first two resource
connections before rejecting local/unsafe URLs. Local entries could therefore
consume the entire attempt budget without any remote request. The local fix
counts only distinct safe requests, retains the two-request limit and five-second
timeout, and leaves the connection security policy unchanged. A regression
places invalid/local/duplicate entries before two allowed remote URLs.
This fix is not deployed and is not yet proven to explain Savannah's failure.

Verification: four focused Plex tests passed; `pnpm run check` passed;
`pnpm run edge:check` passed all 23 function typechecks and lint across 56 files
after correcting the test mock's missing await; `git diff --check` passed.

Staging rollout commands (subsequently approved and executed below):

```sh
node scripts/supabase-staging.mjs functions deploy media-sync
node scripts/supabase-staging.mjs functions deploy tracking-worker
node .playwright/import-pilot/plex-connect.mjs profiles
```

The wrapper fixes the destination to PLOT Staging. Both functions import the
changed module. Their checked-in JWT settings remain unchanged. This approval
request covers deployment and discovery only, not selecting a profile, importing
history, scheduling jobs, changing credentials or deploying production.

### Approved staging deployment and discovery result

Savannah explicitly approved deploying to staging and checking Plex. Both
`media-sync` and `tracking-worker` deployed successfully to the fixed staging
project `uzrhfivnhdcfieuaxzip`, including the updated `plexTracking.ts` module.
Remote deployment succeeded despite the CLI's Docker-not-running warning.

Fresh `sources` discovery returned HTTP 200. The subsequent `profiles` check
still returned HTTP 500: "The selected Plex server is unreachable or denied
access. Check remote access and retry." The connection-budget fix therefore
does not resolve the current live failure by itself. This result does not
distinguish server downtime, remote-access routing or denied server access.

No profile was selected, no viewing history was imported, no scheduler was
installed and production was unchanged. Next requires confirming that the
server is running and accessible remotely to the linked Plex account, then
retrying profile discovery. Staging deployment approval is fulfilled, not pending.
