# Migration and automatic tracking

Implementation record, updated 23 September 2026. **Prepared locally, not launched.**
TMDB clearance is confirmed. Pricing remains US$3/month and US$25/year. Public
pricing, checkout and integration launch switches have not been enabled.

## Supported implementation

### Free saved-file migration

Current verification targets web; mobile is deferred. Web and mobile share parsing, identifier resolution, match review, duplicate
review and atomic writes. Both require confirmation before importing. Ambiguous
matches remain unselected; IMDb external IDs are resolved before title matching.
No title or episode ID is invented. Unknown watch dates remain null.

| Source | Verified scope | Limits |
| --- | --- | --- |
| Letterboxd | Strict saved diary/watched/ratings/reviews CSVs, watchlist and custom lists; ZIP/multi-file routing; browser overlap/reimport and iOS picker flows | Supported root layout only; unfamiliar files reported; watched-summary/diary overlaps require review; annotation flag remains off |
| IMDb | Real saved movie ratings, series/miniseries rating annotations and mixed movie/TV watchlists; web and staging persistence/replay | Episode/other rating types and custom-list exports remain unsupported; Created/Modified/Date Rated never become watch dates |
| Netflix | Public saved Title/Date CSV; short-year dates; unique named episodes resolved within numeric seasons; manual title review; browser and staging replay | Localised/non-numeric seasons and account-wide activity export not verified |
| Amazon Prime | Public native playback CSV; manual selection required; UTC start instants and title quoting; browser and staging replay | Playback is not evidence of completion; localised episode extraction and session consolidation not inferred |
| Apple, Disney+, Max | Existing parsers and synthetic web flows; unsupported/competing JSON collections explicitly rejected | Authentic provider files remain unverified; TV watches without reliable episode identity are rejected |
| TV Time | Liberator JSON/ZIP and GDPR tracking CSV adapters, browser and iOS file flows | Disabled; complete authentic-file coverage still needed. GDPR CSV support follows pinned public fixture headers and preserves source episode ordinals, but still needs an authentic complete archive. Saved exports only, no recovery promise |
| Trakt saved exports | Individual movie/episode history, watchlist, ZIP and limited annotation files; browser flows and iOS history/rating imports | Disabled; history/watchlists can review missing identifiers or years; annotations limited to non-empty sampled layouts; no complete native-account archive or aggregate watched-file claim |

Fixture sources and sanitisation are recorded in
[the fixture README](../../packages/core/tests/fixtures/imports/README.md).
Savannah has already confirmed she has no saved exports available locally.
A subsequent search found [public fixture sets and export excerpts](public-export-samples.md)
for TV Time and Trakt. Their provenance and remaining real-file validation
limits are recorded separately; these adapters are still not enabled.

The normal web startup now accepts `VITE_IMPORT_ANNOTATIONS_ENABLED=true` for
an explicitly configured staging build, alongside `VITE_IMPORT_EVENTS_ENABLED`.
Both default off. The separate TV Time adapter remains internal-only. This wiring
does not enable any deployed environment, prove the normal authenticated app
journey, or approve public rollout. Current evidence and open gates are in
`import-verification-matrix.md`; older dated sections there are historical.

Individual watches use an additive private event store. Original provider event
IDs, or SHA-256(file) plus original row position, make retries idempotent while
retaining rewatches. Source ratings/reviews and external identifiers are retained.
PLOT's existing title-level history key is unchanged and existing ratings/notes
are never overwritten. Potential overlaps between distinct source events require explicit
review. Letterboxd files with the same source entry ID can combine complementary
fields; conflicting values fail explicitly. Distinct watches are not merged or
deleted based on title text.

List membership uses separate RPCs and provenance, never the watch-event writer.
The user can include or omit a custom list at review. Free accounts stop at five
custom lists; additional lists are explicitly reported as not imported. Reimport
preserves a list rename and does not resurrect deleted items or deleted lists.
Source list notes/descriptions and ratings remain in private provenance/export;
this is not a claim that a new list-note editing interface has shipped. Watchlists
and custom-list items now page beyond the database's 1,000-row response cap.

### Episode progress

Imported episode events supplement the existing continuous progress pointer.
Sparse episodes do not advance that pointer or create whole-series history.
Both episode guides display gaps, support manual undo/redo and keep season edits
within the selected season. Private manual overrides survive reimport. Specials
are not implicitly watched by the ordinary season pointer. Failed reads disable
edits until retry; source events are retained when a user changes displayed state.

### Trakt pilot

Existing OAuth and AES-GCM encryption are reused. The worker processes paginated
history followed by movie/show watchlists, checkpointing each page atomically with
its writes. Individual episode plays and rewatches retain their source identity.
Incremental history reads overlap the previous cursor by a day; weekly full reads
reconcile backdated activity. Remote deletions never erase PLOT history or lists.
Imported membership provenance preserves subsequent local watchlist removals.

One-time history/watchlist migration is free. Scheduled updates require the
server's Premium entitlement. The UI explains that Trakt imports what Trakt
already knows and does not connect Netflix or other streaming accounts. This
pilot does not claim a complete Trakt account archive, personal-list migration,
or separate ratings/comments API migration. Saved-file format verification is
still required for that part of the plan.

### Plex pilot

Linking uses the existing PIN flow, now with one shared polling protocol for both
apps. The actual `authorized` response and returned integration object are handled;
timeout, cancellation, popup failure and late responses are surfaced/fenced.

Users explicitly choose a server and profile from freshly fetched provider data.
Every history row must match the selected profile, even with an admin token.
Connections retain the existing public-address/plex.direct SSRF allowlist and
reject redirects. Stored/displayed server metadata excludes access tokens. The pending migration
sanitises legacy resource JSON and clears old automatic server picks without
explicit profile consent; this data change needs production approval too.
The worker reconciles paginated history in small batches, uses stable per-play
history keys and resolves TV episodes through the parent series metadata.
An inaccessible server is a failed/retryable history job, never watchlist-only
success. Changing the selected profile atomically cancels old leases and pauses
automatic consent. Webhooks, downloads and Sonarr/Radarr are not included.

The Plex API behaviour is based on the [Plex server API reference](https://developer.plex.tv/pms/)
and [Python-PlexAPI's implemented history/profile operations](https://github.com/pushingkarmaorg/python-plexapi/blob/master/plexapi/server.py).
Live multiple-profile/server behaviour still requires an authorised pilot.

### Job lifecycle and privacy

- Durable page checkpoints, expiring fenced leases, retry/backoff, provider
  rate-limit handling, a single open job per connection and per-account locking.
- A stale worker cannot commit after a new claim, disconnect or profile change.
  Premium is checked again before committing scheduled work. Expiry pauses it.
- Partial imports show counts/review items and wait before another scheduled run;
  exhausted retries remain stopped for explicit user action.
- Settings on both platforms show last successful sync, queued/running/paused/
  partial/failure state, counts, duplicate review, retry/cancel and disconnect.
- Connections are incoming-only. The schema supports separate outgoing consent,
  but outgoing changes are disabled and **not offered in this pilot**.
- Disconnect first stops work, then revokes provider access. If revocation fails,
  the connection remains disabled with an actionable retry; imported data stays.
- Free export pages all data, includes provenance/events/manual overrides and
  excludes encrypted credentials, worker leases and legacy Plex credential blobs.
- Worker pilot allowlists prevent an approved test from touching other accounts.
  Public rollout requires its own explicit switch.

## Flags and deployment order

All new switches default off. Do not deploy the new exporter before its tables
exist. Applying migrations and deploying production code still require approval.

1. Review and apply the approved additive migrations, including saved-list imports.
   The five-list allowance must exist before clients advertise that allowance.
2. Deploy `tmdb-proxy`, `export-user-data`, `trakt-sync`, `media-sync` and
   `tracking-worker` together with the required secrets/configuration. The worker
   uses exact service-secret authentication with `verify_jwt=false`, compatible
   with rotated API keys; user JWTs/public keys are rejected. Vault bearer and
   the worker service key must match. See [Supabase service authentication](https://supabase.com/docs/guides/functions/auth).
3. Configure only explicitly approved staging pilot UUIDs in
   `TRACKING_PILOT_USER_IDS`. Keep `TRACKING_PUBLIC_ENABLED=false`.
4. Enable `TRACKING_JOBS_ENABLED` plus **one** provider's
   `TRAKT_TRACKING_ENABLED` / `PLEX_TRACKING_ENABLED` for its pilot. Keep
   `TRACKING_OUTGOING_ENABLED=false`.
5. Enable `VITE_IMPORT_EVENTS_ENABLED` / `EXPO_PUBLIC_IMPORT_EVENTS_ENABLED` and
   `VITE_TRACKING_JOBS_ENABLED` / `EXPO_PUBLIC_TRACKING_JOBS_ENABLED` only in pilot
   builds. The Trakt callback respects the new pilot flag independently of the
   old public integration switch.
6. Invoke the worker manually in staging, then review the separate
   [scheduler install script](../../scripts/install-tracking-scheduler.sql).
   It is deliberately not an auto-applied migration. Obtain approval before
   installing the cron schedule. No webhook or scheduler has been installed.
7. Verify each provider with authorised accounts and browser/device flows. Monitor
   oldest queued work, time since last successful sync, attempts/failures, skipped
   records, duplicate-review counts and time to drain a large import. A single
   invocation handles one page, so scheduling capacity must be measured before
   public rollout. Public activation is a separate approval.

## Direct streaming

The [Younify evaluation](younify-evaluation.md) contains a source-checked capability
matrix, native compatibility gaps, cost sensitivities at both PLOT price points,
implementation boundary and a concrete unsent provider enquiry. The public SDK
advertises RN 0.81; PLOT uses RN 0.86.3. No Expo compatibility claim is made.
The documented refresh-request endpoint is user-interaction-only and must not be
used as a scheduled force-refresh. AU coverage, partner keys, history behaviour,
commercial terms and native compatibility need provider access and live proof.
No SDK has been installed and no account/provider has been contacted.

## Verification record

Latest local verification results (17 September 2026):

| Check | Result |
| --- | --- |
| Lint and web build | Passed; zero errors, 189 existing warnings |
| Web and core unit tests | 864 passed (303 web, 561 core) |
| Edge checks | 23 functions typechecked, 20 tests passed, lint clean |
| Mobile TypeScript | Passed |
| Chromium smoke flows | 10 passed with local provider/database mocks |
| iOS bundle export | Passed; this is not an authenticated device pilot |
| Rollback-only staging proofs | 27 passed (4 saved lists, 14 tracking, 9 watch events); tracking rerun passed after migration rename |
| Production-copy migration restore | All 5 pending migrations applied; temporary database removed |
| Production function comparison | 11 new functions; no existing function replaced or dropped |

Tracking uses migration version `20260917100000`. The earlier proposed
`20260917010000` collided with the independently added private-title-notes
migration on main and was renamed before rollout. A migration runner compares
versions, so the colliding version would have incorrectly skipped tracking.

The local verification commands are:

- `pnpm run check` (lint + web build).
- `pnpm run test:unit` (web and shared-core tests).
- `pnpm run edge:check` (23 functions plus shared edge tests).
- `pnpm --filter @plot/mobile run typecheck`.
- `pnpm run test:smoke` (public routes, sparse episode edits, tracking Settings and
  real saved-list file review; all provider/database boundaries are local mocks).
- `pnpm --filter @plot/mobile exec expo export --platform ios --output-dir /tmp/plot-tracking-ios-verified-20260917`.
- `pnpm run staging:watch-events-test`, `pnpm run staging:tracking-jobs-test`,
  `pnpm run staging:saved-lists-test` (all roll back).
- `pnpm run db:migration-test`, `pnpm run db:function-diff` against throwaway local
  production copies. Vault/pg_net are stubbed; staging tests separately exercise
  ownership and RPCs under authenticated identities.

These tests do not establish live provider coverage, native authenticated device
behaviour, Stripe lifecycle correctness or readiness to accept subscriptions.
TV Time saved-export adapters, complete Trakt archive support, verified streaming episode-file resolution,
IMDb TV/custom-list formats and the full direct-streaming integration remain
unverified. Do not advertise those capabilities. No production migration,
deployment, paid commitment, subscription activation or live-account import has
been performed by this workstream.

### Trakt saved-history preview follow-up

The shared `traktImport.js` parser now accepts individual movie/episode history
arrays, retaining event IDs, timestamps and episode ordinals. Unsupported records
reject the whole file before resolution or writes. IMDb lookup goes through the
existing resolver; source TMDB integers are never trusted as selected matches.
Web/mobile options are hidden when the import-events flag is off. Public fixture
provenance is documented; live/native export compatibility is not established.

Validation: `pnpm run check` passed (0 errors, 189 existing warnings);
`pnpm run test:unit` passed 867 tests; mobile TypeScript passed.
`pnpm run test:smoke` passed 11 browser flows, including rejection of aggregate
Trakt files before writes. Successful live Trakt-file imports and authenticated
native device flows still require validation.

### Cross-platform audit continuation

See the [verification matrix](import-verification-matrix.md) for the current
source-by-source gaps and native evidence. The real iOS document-picker, review,
confirmation and repeat-file flow passed with isolated Trakt data. Both apps now
show episode ordinals, clear prepared state when accounts change and derive
duplicate preview counts from individual event identities. Mobile surfaces
parser errors. TVDB identifier lookup is prepared in shared core and the proxy;
the deployed proxy still needs the reviewed find-route change before pilot use.
The complete migration goal remains open.
