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

### Catalogue routing limitation

The deployed edge function requires TMDB_PROXY_SHARED_SECRET. Its value is not
locally available; secret listing reveals only its digest. No existing secret
was rotated. For runtime web/iOS tests, a loopback-only bridge on port 5190 used
the existing server-side TMDB key and fetched live catalogue responses. This
proves live matching plus real staging persistence, but does not prove the
deployed Worker-to-edge route. That admission-control chain remains to verify.

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
