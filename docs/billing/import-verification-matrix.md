# Import verification matrix

Current scope (23 September 2026): Savannah requested verification across import
sources on web. Mobile is deferred, including iOS. Earlier native evidence is
retained below as history, not as a current completion requirement. The goal
remains open until the supported-format boundaries and remaining sample gaps
are resolved; passing synthetic transports is not universal provider support.

## Current web verification, 23 September 2026

### Normal signed-in mixed Trakt ZIP

`node scripts/verify-web-trakt-annotations.cjs .playwright/import-pilot --mixed-zip`
passed against the same real local web/staging setup. A constructed ZIP packages
the sourced history fixture and separate show/episode rating fixtures under their
supported filenames. Ordinary login and Settings navigation lead to review of
four records; no write happens before confirmation. The QA explicitly keeps
fixture watches separate from other pilot sources where overlap review requires
it. Watches and annotations go to their separate real RPCs. Reload/reimport
reports all four as duplicates, and database snapshots prove no further writes.
Existing history and event rows stay unchanged; the Trakt episode watch and
episode rating retain their distinct season/episode identities. No uncaught
browser errors occurred.

This closes mixed-archive routing through the normal app; it remains a
constructed archive of sourced fixtures, not a complete untouched native Trakt
account export or live OAuth sync. Plex deployment approval is still pending.

### Normal signed-in Trakt annotation journey

`node scripts/verify-web-trakt-annotations.cjs .playwright/import-pilot` passed
against the real web application on local port 5183, explicitly configured for
PLOT Staging with event/annotation flags enabled. This uses the ordinary login,
Home, Settings and Import routes, not the isolated fixture component. The
existing authorised synthetic QA account imported the sanitised saved show-rating
record, after preview and confirmation, through real staging Auth, catalogue
and annotation RPCs. Reload/reimport reported one duplicate and zero insertions.
Database snapshots showed unchanged history and watch events; the annotation
was present with its original IMDb identity and rating. No uncaught page errors.

The harness refuses requests to other Supabase project hosts. It does not
connect a Trakt account or certify a complete native archive. Credentials remain
private, production configuration is unchanged, and the Plex staging deployment
approval request is still pending. This closes the ordinary-app annotation
import-path gap only; annotation presentation outside import/export remains
separate from this proof.

`pnpm run check`, focused ESLint of the new verifier, and `git diff --check`
passed. The local server is a staging-only development process, not a deployment.

### Completion audit and next gates

The goal is not complete. The following separates current evidence from the
older dated implementation history below; a passing fixture suite is not proof
of every provider's native export or the deployed normal application.

| Requirement | Current evidence | Remaining work |
| --- | --- | --- |
| Supported real-file formats, clear unsupported versions | Pinned Netflix, Amazon, Letterboxd and IMDb samples; explicit parser/archive errors | Authentic Apple/Disney/Max files, complete native Trakt and TV Time files; remaining list/episode layouts |
| Web select, resolve, review, confirm, results | 48 Chromium tests; prior authenticated staging history and session-recovery runs | Normal authenticated web journey for newly added annotations/native Amazon and mixed IMDb lists; fixture components are not that journey |
| IDs, dates, rewatches, episode progress | Live staging catalogue and event persistence; missing dates stay unknown; named Netflix episode validation | Unverified source shapes must remain excluded; no completion inference from playback |
| Existing edits and duplicate-safe retries | Staging event/replay/isolation scripts, batch/lost-response browser cases, rollback list-policy proofs | Exercise each newly verified format through the normal web entry point before rollout |
| Ratings, reviews, list membership | Event metadata, list provenance and separate annotations persist; export collector includes annotations | Imported annotation display on ordinary rating/review surfaces is not established: current web reads this table for import review only. Do not imply ratings replace existing PLOT edits |
| Free five-list allowance | Shared logic, browser selection and staging policy/RPC proofs | Further provider custom-list format support needs source evidence |
| Release readiness | Local lint/build/unit/browser and authorised staging proofs | Production flags/deployment remain unapproved; mobile is explicitly deferred |

`apps/web/src/main.jsx` now injects the default-off
`VITE_IMPORT_ANNOTATIONS_ENABLED` setting. Previously only fixtures could turn
on that core flag. The new setting enables a deliberate staging build without
altering production configuration. It does not itself verify an authenticated
annotation import or its presentation elsewhere in the app.

### Unsupported streaming JSON layouts

Disney+, Max and Apple JSON parsing now rejects unknown envelopes, scalar/null
documents, malformed recognised collections and multiple competing collections.
Previously an unknown envelope could appear to be empty history, or the first
recognised collection could hide a second collection. Empty arrays and a single
recognised empty collection remain valid. The shared explanation says the
layout is unsupported and nothing was imported. Browser cases check that each
of the three sources stops before offering confirmation or writing history.

This tightens failure reporting; it does not establish authentic export support
for these providers. The additional sample search is recorded in
`public-export-samples.md` and left the real-file validation gate open.

Verification: `pnpm run test:unit` passed 945 tests (304 web, 641 core),
`pnpm run test:smoke` passed 48 tests, `pnpm run check` passed with existing
warnings, and `git diff --check` passed. No deployment or migration.

### Native Amazon playback CSV

A pinned public saved PrimeVideo.ViewingHistory.csv establishes Amazon's UTC
playback-start column and literal title quoting. The parser now recognises this
layout, preserves valid start instants, leaves invalid/missing times unknown,
and requires manual title selection for every playback row. The document report
explains partial plays, trailers, channels and multiple sessions per watch; it
remains visible after confirmation. Unselected activity stays out of history.
This does not establish completed-watch or localised TV-episode inference.

`node scripts/verify-import-sources.mjs .playwright/import-pilot --prime-playback`
passed on the authorised synthetic QA accounts: two explicitly selected movies,
exact UTC start instants, duplicate-free replay, cross-account isolation and
unchanged existing summary dates/ratings/notes. The verifier explicitly chooses
the 2020 Palm Springs and 2002 Chamber of Secrets after seeing live candidates;
the product does not auto-select those years. Its log's generic matrix label
refers only to this two-row mode. The browser case selects just one movie and
checks that the second remains reported as left out.

Verification: `pnpm run test:unit` passed 944 tests (304 web, 640 core),
`pnpm run test:smoke` passed 45 tests, `pnpm run check` passed with existing
warnings, and `git diff --check` passed. No production deployment or migration.

### IMDb series and miniseries ratings

The pinned public ratings CSV supplies series/miniseries records independently
of the watchlist sample. These now become show-scope rating annotations, retaining
the rating date without creating watch events or episode progress. Invalid
rating dates reject the file. The document boundary requires both event and
annotation support, so a disabled annotation writer cannot silently drop them.
Existing movie-rating behavior is unchanged; episode and other unrecognised
title types remain explicit errors.

`node scripts/verify-import-watchlist.mjs .playwright/import-pilot --tv-ratings`
passed: two live catalogue matches persisted as IMDb show ratings, replay
reported two duplicates and no insertions, existing history/watch events were
unchanged, and another synthetic QA account could not read the annotations.
Browser coverage checks confirmation, separate annotation persistence and replay.

Verification: `pnpm run test:unit` passed 943 tests (304 web, 639 core),
`pnpm run test:smoke` passed 44 browser tests, `pnpm run check` passed
with existing warnings, and `git diff --check` passed. No migration or deployment.

### IMDb mixed movie and TV watchlists

A pinned public saved IMDb watchlist supplies real movie, tvMovie, tvSeries and
tvMiniSeries records. The parser now maps these to movie/TV watchlist membership
and still rejects episode or unknown title types. Personal dates, ratings and
descriptions were removed from the four-row fixture. Its IMDb identities were
resolved through the staging Worker; browser tests use those captured responses.

`node scripts/verify-import-watchlist.mjs .playwright/import-pilot` passed on the
two authorised synthetic QA accounts: all four titles persisted in the actual
watchlist, replay inserted nothing and reported four duplicates, history and
watch events stayed unchanged, and another account could not read the owner's
import provenance. The first verifier run used an incorrect table name for its
post-write read; it was corrected to `lists`/`list_items` and rerun successfully.

`pnpm run test:unit` passed 942 tests (304 web, 638 core),
`pnpm run test:smoke` passed 43 browser tests, `pnpm run check` passed
with existing warnings, and `git diff --check` passed. The browser test asserts
four correctly typed list records and no watch events. IMDb TV ratings,
episode watchlists and custom lists remain unverified/unsupported. TV series
ratings were subsequently verified above.

### Manual Netflix series review

Web manual title selection now uses the shared episode resolver. When a Netflix
series needs review, choosing a catalogue candidate fetches that candidate's
season and accepts only a unique exact episode-name match. Confirmation and
further title changes are disabled during the lookup. Failed lookups retain the
candidates for retry; missing or ambiguous episodes remain unconfirmed, and a
previous episode ordinal cannot survive a failed verification. Duplicate review
is recalculated against the selected episode and existing imported events.

Regression coverage includes a manual browser selection followed by confirmation
and persistence, automatic named-episode resolution/replay, failed lookup retry,
missing episodes, and changing the selected series. Localised and non-numeric
season labels still require authentic format evidence before support is added.

Verification: `pnpm run test:unit` passed 941 tests (304 web, 637 core),
`pnpm run test:smoke` passed 42 browser tests, `pnpm run check` passed
(existing lint warnings only), and `git diff --check` passed. No deployment or
mobile change was made.

### Explicit streaming omissions

Netflix, Prime and Max CSV imports, and Disney+, Max and Apple JSON imports,
now report data records without a usable title instead of silently filtering
them out. Blank CSV rows are ignored. Reports identify the source record and
remain visible after confirmation. Max JSON record errors and truncated JSON
also remain parser errors instead of falling through into CSV parsing.

The browser regression confirms that no event is written before confirmation,
one valid entry imports, and the omitted entry remains in the results report.
`pnpm run test:smoke` passed all 41 tests. After fixing an unnecessary regex
escape caught by lint, `pnpm run check` passed with zero errors and 189 existing
warnings. The focused parser/document command
`node --test packages/core/tests/unit/importDocument.test.js packages/core/tests/unit/importParsing.test.js`
passed all 59 tests. `pnpm run test:unit` passed all 940 tests (304 web,
636 core), and `git diff --check` passed. This verifies reporting for the accepted parser shapes;
authentic provider export coverage gaps described below remain open.

### Trakt missing catalogue metadata

The first-hand API response in `trakt/trakt-api#815` contains an orphaned movie
watchlist record with null IMDb/TMDB IDs and release year. A sanitised fixture
now captures that shape. History/watchlist parsing permits absent IDs and years
while retaining the source event/list identity; invalid titles, identifiers,
timestamps and episode ordinals remain errors. Available IMDb/TVDB IDs are
resolved first, then title/year. A title-only Trakt result never auto-selects,
even when the catalogue returns just one candidate.

The new web regression proves no write before manual title selection, followed
by one confirmed event with no invented date. This is parser/resolver/browser
evidence; it does not certify complete native Trakt archive compatibility.
The broader authentic-export gate remains open. Latest checks:
`pnpm run test:unit` 937 passed (304 web, 633 core), `pnpm run test:smoke`
40 passed, `pnpm run check` and `git diff --check` passed.

### Streaming CSV column integrity

Netflix, Prime and Max CSV fields now match whole normalised column names,
not substrings. This prevents `Release Date` being treated as `Date` and
`Profile Name` as `Name`. Explicit Date Watched/Watched Date aliases remain
supported. Regression cases cover unrelated metadata before a valid watch
column, missing watch columns and missing title columns. Missing watch dates
remain unknown; a metadata-only file creates no guessed watch records.

`pnpm run test:unit` passed 935 tests (304 web, 631 core); the focused parser
suite also passed after retaining the Watched Date alias for Max.
`pnpm run check`, `git diff --check` and the 39-test browser suite passed.
The first browser permission review timed out before execution; its single
retry started successfully and completed with all tests passing.

### Netflix compatibility follow-up

A public saved Netflix CSV exposed DD/MM/YY dates. Added a minimised fixture
with synthetic replacement dates and a pinned source in the fixture README.
The parser now expands Netflix's two-digit streaming-era years and detects
day-first conventions from both short and full years. Other formats do not
silently inherit a guessed century. Multiple colons in a movie title no longer
cause it to be stripped into a guessed television series.

Netflix rows with an explicit numeric Season/Series label and an episode name
now retain those fields. Web passes a season lookup into the shared resolver,
which accepts only a unique exact-normalised episode-name match in the matched
series/season. Requests are cached per season. Missing/duplicate names or failed
lookups remain unmatched; changing the selected series cannot reuse an episode
ordinal resolved for a different series. Localised or non-numeric season labels
are not inferred. Manual series review was subsequently added above.

`node scripts/verify-import-sources.mjs .playwright/import-pilot --netflix-episodes`
passed using the saved CSV fixture, real deployed catalogue lookups and the
approved staging QA accounts: two episode events, exact date precision, safe
replay, cross-account isolation and unchanged existing summary edits. This
mode uses a separate stable QA source-account key. It does not repair older
records whose original import omitted a date.

Latest checks after these changes: `pnpm run test:unit` passed 933 tests
(304 web, 629 core), `pnpm run test:smoke` passed 39 tests, `pnpm run check`
passed, and `git diff --check` passed. No mobile files, migration, deployment,
public flag or user account settings changed. Mobile rendering/season lookup
wiring remains explicitly deferred by Savannah.

### Earlier same-day source matrix

- `pnpm run test:smoke`: 37 browser tests passed. Added Netflix, Prime, Disney+,
  Max, Apple TV and IMDb review, explicit confirmation and reimport journeys.
  Each checks no writes before confirmation, unknown dates and no duplicate
  watches after replay. These use the actual web import UI and an isolated
  writer; streaming payloads are synthetic, IMDb uses a sanitised public sample.
- `node scripts/verify-import-sources.mjs .playwright/import-pilot`: passed for
  all nine sources against the existing private staging QA accounts and deployed
  catalogue Worker. Ten source events persisted with unknown dates; repeated
  runs created no duplicates. Trakt episode ordinals survived. The second QA
  account could read none of the first account's records. Existing PLOT summary
  dates, ratings and notes stayed unchanged. This is shared-pipeline-to-database
  evidence, separate from the browser fixture tests.
- One Letterboxd row required review because the saved export says 1953 while
  TMDB returns 1955 for Summer with Monika. It remained excluded; no fabricated
  identifier or automatic choice was used. The other diary row persisted.
- `node scripts/verify-import-recovery.mjs .playwright/import-pilot`: passed
  again with 101 unique events, lost-response retry, unknown dates and isolation.
- Fixed impossible numeric calendar dates being accepted and unfinished CSV
  quotes being silently parsed. Invalid dates stay unknown; truncated quoted
  files stop before matching/writing. Unit and browser regressions cover both.
- `pnpm run test:unit`: 930 passed (304 web, 626 core).
- `pnpm run check`: passed, zero lint errors, 189 existing warnings.
- `git diff --check`: passed. No schema, deployment or public flag changed.

The first browser run lacked the pinned Chromium binary. After installing it,
macOS sandbox restrictions still prevented launch; the approved unrestricted
run worked. Six new tests initially used an overly strict text selector and
failed to recognise the visible combined movie/date label; that selector was
corrected before the final 37-test pass.

Remaining source-format limits are material: current authentic streaming export
samples, complete native Trakt archives and complete TV Time Liberator exports
are not established by this matrix. Streaming episode records without reliable
season/episode identity are deliberately left out. TV Time GDPR CSV, IMDb episode ratings,
episode watchlists and IMDb custom lists remain unsupported. TV Time's public adapter flag remains
disabled. Do not advertise every provider export/version as verified.

## Current evidence

| Area | Evidence | Remaining proof |
| --- | --- | --- |
| Shared event pipeline | Unknown dates, source IDs, rewatches, duplicate review, batched writes, local-edit preservation; interrupted retry verified in browser and actual iOS UI | Live database/network interruption journey; process termination recovery |
| Trakt saved files | History/watchlist ZIP routing and limited ratings/comments, browser flows, iOS history and episode-rating imports | Complete authentic native archive coverage and authorised staging journey |
| Letterboxd | Saved CSVs, ZIP/multi-file routing, browser overlap/reimport/list-cap tests; actual iOS CSV and ZIP flows | Broader complete-export samples and authenticated staging journey |
| IMDb | Movie ratings, series/miniseries rating annotations and mixed movie/TV watchlists; web browser and authenticated staging persistence/replay verified above | Episode and other title-type ratings, episode watchlists and custom-list formats |
| Netflix / Prime / Disney+ / Max / Apple | Existing parsers; synthetic shared-flow tests for unknown dates and rejection of ordinal-free TV records | Authentic current export versions, verified episode resolution, native journeys |
| TV Time | Liberator JSON/ZIP adapter, browser and iOS file flows; GDPR fixtures inspected | GDPR CSV adapter and complete authentic saved-file coverage; no live connection |
| Web isolation | Browser account switch discards the previous user's import preview | Live staging application journey |
| Database | 32 rollback-only staging checks across events, lists, tracking and annotations; six pending migrations restored on a temporary production copy | End-to-end app-to-staging import with authorised account |
| iOS | Native picker journeys for Trakt history/episode ratings, Letterboxd CSV/ZIP and TV Time; 60-event interrupted retry finishes with 60 unique events | IMDb/streaming file journeys, remaining failure cases and authenticated staging journey |
| Android (deferred by user) | Earlier bundle checks only | Outside current scope; do not treat Android device testing as a launch gate |

## Corrections made during this audit

- Mobile now displays unsupported-format parser errors rather than replacing
  them with a generic file-read failure.
- Both apps remount import state on account changes, preventing an old account's
  prepared preview from being confirmed for a newly signed-in account.
- Web catches file-read failures before parsing.
- Event-only source formats cannot fall back to legacy summary writes if the
  import-events flag changes after a preview was prepared.
- The deployed TMDB proxy currently rejects the new external-ID lookup route.
  Direct server-side TMDB lookups verified the Trakt fixture identities; this
  does not prove the deployed browser route. Deploy the reviewed proxy changes
  before enabling imports, then exercise the route through the actual Worker.

## Historical next steps (17 September, superseded by the current audit above)

1. Complete remaining supported streaming native file journeys. Large-file,
   interrupted-write and archive-partition browser coverage is implemented;
   native interruption recovery is also verified below.
2. Validate further authentic source samples before expanding accepted formats.
   TV Time Liberator is implemented; its separate GDPR CSV format remains
   unsupported. Do not infer rewatch dates from counts or guess missing fields.
3. Exercise deployed staging routes with an authorised account, including
   interruption/retry against actual database persistence and account isolation.
4. Complete the separately authorised account-specific Trakt/Plex pilot after
   deployment prerequisites are reviewed and approved. Account flag approval
   does not establish provider linking, successful sync, or public readiness.
   Pricing, checkout and public integration activation remain unchanged.

## Latest full browser gate (2026-09-17)

`pnpm run test:smoke` passed all 29 tests after the retry/result-copy changes.
This includes application routes, history imports, list imports, episode
progress and tracking settings. The initial sandboxed attempt could not launch
Chromium; the approved unrestricted rerun exited successfully. Browser fixture
writes are isolated test doubles, not evidence of deployed provider or database
behaviour. Later sections preserve the chronological results from earlier
passes; their older totals are not the current suite total.

## Native proof details

A separate `PLOT Import QA` simulator was created (iOS 26.5, iPhone 17 Pro).
The existing local SDK 57 development binary was copied for this test, with
document sharing enabled only in that temporary binary. The original simulator
was not modified. A temporary Metro project at `/tmp/plot-import-native-fixture`
loaded the real mobile `ImportHistoryModal`, captured TMDB responses and an
in-memory event writer. No real account was linked and no Supabase writes ran.

Observed through the native picker and actual app screen:

- Selected `trakt-history.json` from Files.
- Reviewed High Potential and Saint, both with unknown watch dates.
- Added episode label was visible as `Season 2, episode 13`.
- Confirmed: `2 entries added · 0 duplicates skipped · 0 not saved`.
- Writer output contained the expected episode and movie identities; both dates
  remained null.
- Repeated the file: `0 entries added · 2 duplicates skipped · 0 not saved`.

The repeat preview initially mislabelled saved events as new. The shared event
status calculation was corrected and a browser regression assertion now checks
`0 new · 2 skipped` before confirmation. This does not establish all source
formats or production/native authentication readiness.

Latest automated commands: `pnpm run check`, `pnpm run test:unit`,
`pnpm --filter @plot/mobile run typecheck`, `pnpm run edge:check`,
`pnpm run test:smoke`. Current totals: 881 unit tests (303 web, 578 core), 14 browser flows,
23 edge functions checked and 20 shared edge tests. Lint/build and mobile
TypeScript pass with no new errors (189 existing lint warnings).
Both-platform native export command:
`pnpm --filter @plot/mobile exec expo export --platform ios --platform android --output-dir /tmp/plot-import-audit-native`.

## Mixed selection writer preparation

The shared writer now partitions combined selections into watch events and
separate list destinations. It returns per-list outcomes, including unselected
lists and the Free allowance, and can complete independent lists when a watch
batch fails. Mixed selections fail closed if the event flag is disabled. This
is preparation for archive orchestration, not evidence that ZIP uploads or TV
Time adapters are available. Existing single-file UI flows are unchanged.

Regression tests cover separation of watches from memberships, selected and
unselected lists, allowance reporting, partial failure, progress totals and
flag changes before confirmation.

## TV Time document parser preparation

Added a report-bearing parser for the publisher's extracted shows/movies/lists/
favorites JSON files. Focused tests exercise verified external-ID resolution,
episode ratings and ordinals, unknown dates, timezone-free timestamps, aggregate
rewatch reporting, nested list/history separation and malformed-file rejection.
The reports are required input to the forthcoming review UI; the adapter remains
unexposed until both apps can show them. GDPR CSV adapters, archive extraction,
real-file validation and native TV Time journeys remain incomplete.

## Document review integration

Both apps now use the shared document adapter, show its omission/precision
report before confirmation, retain it on results, and allow each list in a
multi-list file to be selected independently. Per-list outcomes remain visible.
A separate `tvTimeImportEnabled` config flag defaults false and is not injected
from production environment variables. The isolated browser fixture enables it.
A browser test verifies a saved movie snapshot with aggregate rewatches: no
writes before confirmation, one unknown-date event afterward, and the omitted
rewatch warning retained. This is synthetic format evidence, not real-file or
native-device TV Time verification.

## TV Time review follow-up

TVDB-only movie records now bypass TMDB's television-only TVDB lookup and
require title review when no year is available. A focused test verifies that
an unrelated TVDB television result cannot be accepted as that movie.
Mobile list selectors are inside the scrolling preview header so a file with
many lists cannot push the preview off-screen. Both apps exclude unselected
list memberships from the confirmation/new-entry count. The browser fixture
also exercises two saved lists, deselecting one, confirming only the selected
list, and retaining the omitted-list explanation in results.

## Extracted multi-file TV Time imports

Both file pickers now accept multiple extracted TV Time JSON files, using
`prepareImportFiles` in core. Every record is identified from its original file
content before combining the documents. Selecting the same file twice reports
the duplicate; two different contents with the same filename fail before any
lookup or write. Other sources still require one extracted file at a time.

The browser test imports movies.json plus lists.json, verifies one watch and
one list membership, then imports movies.json alone and verifies that the watch
is skipped as already saved. Core tests verify file-order-independent identity
and rejection of malformed/conflicting bundles. Native picker multi-selection
uses the documented Expo 57 `multiple` option but has not yet been exercised on
a device. This work does not add ZIP decompression or GDPR archive support.

## TV Time ZIP preparation

Added shared in-memory ZIP reading with pinned fflate 0.8.3. Web and mobile
accept one ZIP or extracted files. Known root-level JSON files go through the
same document pipeline; every other archive file appears in the omission report.
Limits: 20 MiB compressed input, 50 MiB declared expanded size and 100 entries.
Malformed ZIP headers, unsafe paths, oversized declarations and unsupported-only
archives are tested. No files are extracted to disk. Core and browser tests prove
ZIP/extracted-file identity equivalence and reimport deduplication.

This does not clear the release gate: native ZIP execution, actual export ZIPs,
checksum/corruption validation beyond decoder errors, and hostile metadata cases
still need verification. The separate TV Time flag remains false in app config.
Sources: https://github.com/101arrowz/fflate and the pinned TV Time exporter
contract in public-export-samples.md. GDPR and other providers' ZIP layouts are
not inferred from this support.

## ZIP integrity follow-up

The reader now validates single-disk ZIP32 central/local metadata before
allocation, then checks each imported file's decoded length and CRC32 against
the directory record. ZIP64, encryption, unsupported compression methods and
inconsistent names/headers are rejected. CRC checks apply to imported JSON;
omitted archive members are not decompressed or claimed as verified.

Regression cases include changed content that still parses as JSON, mismatched
local names, an encryption flag, truncated archives, and a standard CRC check
vector. These supplement size/count/path tests, not authentic exporter or native
execution evidence. Format reference: PKWARE APPNOTE 6.3.10, sections 4.3/4.4:
https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT.

## Native ZIP verification and Metro correction

An actual iOS 26.5 Files-picker run in the isolated `PLOT Import QA` simulator
initially failed: Metro's root-only resolution selected transitive fflate 0.4.9
instead of core's declared 0.8.3. The old decoder ignored the ZIP filter and
passed activity_history.csv to the JSON parser. Browser tests and native bundle
exports had not detected this runtime dependency substitution.

`apps/mobile/metro.config.js` now resolves core imports of fflate from core's
declared dependency location. Root-only resolution stays in place for React
and other dependencies: general hierarchical lookup would also pick core's
different React peer. The first native pass used general hierarchical lookup;
the narrower final resolver was then rerun through the complete native
Files-picker, review and confirmation flow with the same successful result.

Repeated native journey after correction:
- Selected TV Time and tvtime.zip through the real Files picker.
- Reviewed Saint with unknown watch date, omitted aggregate rewatches and the
  alternate CSV representation.
- Confirmed one entry; results displayed `1 entries added · 0 duplicates skipped
  · 0 not saved` and retained both omission warnings.
- The in-memory writer logged exactly one TV Time watch, null watched_at/on,
  unknown date precision and preserved rewatch_count=2 in source metadata.

No live account or database was used. Android device execution and native
multi-file selection/reimport remain unproven. The QA fixture is temporary at
/tmp/plot-import-native-fixture; production flags remain unchanged.

## Trakt saved watchlist

The extracted lists-watchlist.json format now routes to the membership writer
on both platforms, using the shared document pipeline. Movies and shows resolve
through their IMDb identifiers. Watchlist record IDs are namespaced separately
from history event IDs. Listed dates never become watch dates; source notes and
raw attached rating metadata are retained in imported-list provenance, without
overwriting existing PLOT edits. The source label is now Trakt saved export.

Focused tests cover movie/show parsing, original-filename detection, preservation
of notes/rating metadata, and list-only writing. Browser verification exercises
review and confirmation against the isolated list writer. Authentic complete
Trakt archives, separate ratings/reviews/custom lists and native watchlist
journeys remain unverified/incomplete.

## Large export preparation and preview

A 150,000-record synthetic saved-history test reproduced `Maximum call stack
size exceeded` in the document combiner's spread-argument push. Iterative append
now preserves every record and its original file index. This is a preparation
stress test, not evidence of a 150,000-record production database write.

The shared resolver now rate-delays batches only when a new provider request
was made. Cached-only batches periodically yield to the UI without a network
pause per four repeated records. A 2,000-record repeated-title test verifies
one lookup, all results retained and completion within its five-second timeout.

Web previews display 100 records per page; selection handlers retain the
original record index. A 201-record browser flow skips the last record on page
three, returns to page two and confirms 200 writes, asserting the skipped source
identity is absent. Mobile already uses a virtualized FlatList and consumes the
shared preparation/resolution fixes; native large-file execution remains unproven.

Latest checks: `pnpm run check`, `pnpm run test:unit` (903 total: 303 web +
600 core), `pnpm --filter @plot/mobile run typecheck`, `pnpm run test:smoke`
(20 browser flows), and `git diff --check` passed.

## Trakt ZIP history and watchlist

The shared ZIP reader now selects source-specific filenames. Trakt archives
accept root-level watched-history.json and lists-watchlist.json, combining them
through the same per-file identity pipeline as extracted files. Other archive
members are reported as omitted. Both app pickers accept the ZIP or multiple
extracted Trakt files; the existing import-events rollout gate remains unchanged.

Core coverage verifies preserved history identity, membership separation and
omission reporting. The browser flow reviews a combined archive, confirms two
watch events plus one watchlist membership, and checks the distinct writers.
This is not complete Trakt export support: separate ratings, reviews/comments,
custom lists, aggregate history and alternate archive layouts still need work.
Native Trakt ZIP execution and authentic complete-file validation remain open.

## Separate Trakt annotation preparation

Inspected nonempty show/episode rating and season-comment fixtures. Added a
standalone annotation parser preserving rating values, comment text, spoiler
flags, creation/update dates and title/season/episode scope. Unknown dates stay
unknown. No annotation has a watch date or confirmed TMDB identity. Comment
author profiles and social counters are excluded from the parsed record.

Both event construction and the legacy/new selection writer reject annotation
records explicitly. The parser is not wired into file/ZIP dispatch yet: an
additive annotation store, ownership policies, export inclusion, review UI and
non-destructive application to existing PLOT data are still required before
these files can be offered. Current archive reports continue to mark separate
rating/review files unsupported. Tests cover shape, scope, dates, validation and
both watch-writer guards; they do not prove annotation persistence.

## Private annotation storage verification

Prepared additive migration 20260917130000_imported_annotations.sql and a
separate batched core writer. Imported annotations retain their source identity,
confirmed title identity, scope and data in an owner-private table. Reimports
ignore existing source keys. Neither the RPC nor its table changes history,
watch progress, ratings, notes or memberships. The writer defaults off through
importAnnotationsEnabled. The later UI verification section records the
connected dispatch and preview; a post-import browsing/apply UI remains absent.
Free account export includes paginated imported_annotations data.

Verification in this pass:
- All six pending migrations applied to a throwaway production-copy restore;
  the sandbox was torn down afterward. Production had 101 applied migrations.
- Five rollback-only staging checks passed: authenticated ownership/history
  preservation, atomic rejection, direct-write denial, cross-account read
  isolation, and anonymous read/RPC denial.
- Lint/build, mobile TypeScript, migration static checks and all 23 edge function
  checks passed. Core tests verify batched annotation writes, partial failure
  counts and the disabled flag; free-export regression covers 1,001 annotations.

No production migration was applied. These storage checks are independent of the later UI verification below.
They do not prove live-provider readiness or post-import editing behaviour.

### Mixed annotation routing (2026-09-17)

`writeImportDocument` now dispatches annotations to their private store and
watches/list membership to the existing writer. `buildImportRows` excludes
annotations, so downstream history planning cannot infer a watch from a rating
or review. Both rollout flags and unresolved watch-duplicate decisions are
checked before either path writes. Partial annotation failures retain separate
counts; retrying can skip the already imported watches via their source keys.

The shared routing tests cover mixed input, partial failure/retry and flag/review
changes between preview and confirmation. The web and mobile UI now use this
dispatcher. The separately disabled annotation flag is still required.


### Annotation import UI verification (2026-09-17)

- Shared extracted-file and ZIP dispatch now accepts the three filenames backed
  by non-empty public samples: `ratings-shows.json`, `ratings-episodes.json` and
  `comments-seasons.json`. Scope must match the filename. Other annotation
  layouts remain unsupported, including empty fixtures that prove no schema.
- Web/mobile previews identify rating/review scope and annotation dates instead
  of showing an unknown watch date. Spoiler text is not exposed. They explain
  that source annotations remain private, exportable and separate from existing
  PLOT edits. There is not yet a post-import annotation browsing/apply screen.
- Annotation duplicate reads are owner-filtered, paginated beyond 1,000 rows and
  kept separate from watch collision review. Changing a title match still uses
  the corresponding candidate records. The shared history planner excludes
  annotation rows altogether.
- Actual iOS 26.5 QA simulator: real Files picker selected a synthetic
  `ratings-episodes.json`, preview showed High Potential season 2 episode 13,
  rating 8/10 and unknown annotation date. Confirmation inserted one annotation
  with `ratedAt: null` and **zero watch events** in the isolated store. Picking
  the same file again showed 0 new / 1 already imported; confirmation returned
  0 inserted / 1 duplicate / 0 failed. No live account or database was used.
- Android still needs device-level verification. These checks do not establish
  authentic complete provider export coverage or live-provider readiness.


Final checks for the annotation UI pass:
- `pnpm run check`: passed, with the existing 189 lint warnings and no errors.
- `pnpm run test:unit`: 914 passed (304 web, 610 core).
- `pnpm --filter @plot/mobile run typecheck`: passed.
- `pnpm --filter @plot/web exec playwright test tests/smoke/history-import.spec.js tests/smoke/list-import.spec.js tests/smoke/episode-progress.spec.js tests/smoke/tracking-settings.spec.js`: 19 passed. Chromium needed execution outside the filesystem sandbox; its first sandboxed attempt failed at browser launch, before any test assertions.
- `pnpm --filter @plot/mobile exec expo export --platform android --output-dir /tmp/plot-annotation-android`: passed. This is a bundle check, not an Android device test.
- `git diff --check`: passed.

### Native IMDb movie rating (2026-09-17)

The isolated iOS QA app loaded one row from the sanitised IMDb movie ratings
fixture through the native Files picker. A previously captured TMDB response
resolved its IMDb identifier to Red Desert. Preview showed one new entry and
"Watch date unknown". Confirmation saved exactly one event; the in-memory writer
reported source_rating=5 and watched_at=null. No real user data was written.
This verifies the native ratings CSV path, not IMDb TV or custom-list formats.

The observed singular result wording was corrected in shared copy ("1 entry"
and "1 duplicate"). `pnpm run check` and all 29 tests in `pnpm run test:smoke`
passed after that copy change. `git diff --check` passed.


### Letterboxd saved-document verification (2026-09-17)

User scope correction: web and iOS are the current app targets. Android is not
being built yet and is no longer a completion gate for this workstream.

Four non-empty public CSV samples from extratone/bilge commit
3696d149a8c9bb905d877b67d9347b1a2f90ba65 were inspected and minimised. The new
shared document adapter validates exact headers, row widths, calendar dates,
ratings and source URLs. Diary/review entry URLs supply stable watch identities;
watched/rating film URLs share a separate unknown-date watched identity.

Letterboxd's [own FAQ](https://embed.letterboxd.com/about/faq/) states that rating
a film marks it watched without creating a diary date. A ratings import therefore
preserves an unknown-date watched record plus a separate private rating record.
The preview explicitly explains this source-specific behaviour. A rating date
never becomes the watch date. Reviews retain unknown spoiler status and stay
hidden in previews; a review only creates a diary watch when its Watched Date is
present. Existing PLOT edits remain authoritative.

Evidence:
- Six new core tests cover public saved layouts, unknown dates, separate rating
  records, dated versus undated reviews, malformed data and rollout gating.
- Browser selection of ratings.csv followed by watched.csv for the same film
  saved one watch total; the rating date stayed only on its private annotation.
- Actual iOS Files picker selected a synthetic ratings.csv with a previously
  verified TMDB movie response. Preview showed the source-specific explanation,
  rating 7/10 dated 2024-01-02 and a separate unknown-date watch. Confirmation
  saved one annotation and one watch with null watched_at/watched_on. This used
  only the local fixture store, not a real account or staging database.

The later archive verification section below supersedes the single-file limit
from this pass. Legacy parser exports remain for existing callers; the app
document boundary applies the stricter saved-file checks.


### Letterboxd archive overlap verification (2026-09-17)

- Web and iOS now accept a Letterboxd ZIP or several extracted CSVs. Supported
  root files: diary.csv, watched.csv, watchlist.csv, and (behind the annotation
  flag) ratings.csv/reviews.csv. `lists/*.csv` uses the saved custom-list parser.
  Profile, comments, deleted-content and unfamiliar nested files are reported
  as omitted. An enclosing top-level directory is not silently stripped.
- Records with the same original watch entry ID are combined before catalogue
  lookup. Matching diary/review records retain the richer review text; matching
  watched/rating summaries retain the rating. Conflicting non-null dates,
  ratings or reviews fail explicitly instead of depending on file order.
- Different diary entry IDs stay separate. A watched-film summary alongside a
  confirmed diary match requires an explicit review decision. This is based
  on confirmed catalogue identity, never title text alone. The same rule runs
  again in the writer, and both previews recompute it after match/skip changes.
- Browser ZIP test: two dated diary entries plus a watched summary. Confirmation
  was blocked while the summary overlapped. Deselecting/reselecting diary matches
  updated the guard. Leaving out the summary saved both dated watches; repeating
  the archive skipped both already imported events.
- Real iOS 26.5 QA simulator: native Files picker opened a synthetic ZIP with one
  diary entry and one watched summary. Confirm was visibly disabled. Leaving
  the summary out enabled Confirm 1 entry and saved exactly one day-precision
  diary watch. The local fixture log retained 2024-01-01 and a null watched_at.
  No real account, database import, deployment or production flag changed.

These checks cover the supported saved-file layout with synthetic transport
cases and minimised public CSV samples. They do not prove every historical or
future Letterboxd archive version. Previously imported unknown-date summaries
are not automatically deleted when a later diary file is imported; existing
possible-watch review still applies.

Checks for this archive pass:
- `pnpm run check`: passed (existing 189 warnings, no lint errors).
- `pnpm run test:unit`: 924 passed (304 web + 620 core).
- `pnpm --filter @plot/mobile run typecheck`: passed.
- `pnpm --filter @plot/web exec playwright test tests/smoke/history-import.spec.js tests/smoke/list-import.spec.js`: 18 passed.
- `git diff --check`: passed.


### File-loading limits and current verification (2026-09-17)

The shared reader now checks available file-size metadata before reading a ZIP
(20 MiB) or extracted selection (100 files, 50 MiB combined). Native passes the
picker's size metadata; browser File objects already provide it. Extracted
files are read sequentially, with actual UTF-8 size checked even if metadata is
missing. Failure stops later reads and occurs before catalogue resolution or
any database writes. Native cache copying by the OS picker happens earlier;
this guard bounds application reading, not the picker's own cache operation.

- `pnpm run check`: passed, existing lint warnings only.
- `pnpm run test:unit`: 927 passed (304 web, 623 core).
- `pnpm --filter @plot/mobile run typecheck`: passed.
- `pnpm --filter @plot/web exec playwright test tests/smoke/history-import.spec.js`: 14 passed, including a real browser 21 MiB ZIP selection rejected before preview/writes.
- Core tests prove no readers are called for oversized metadata, multibyte text
  cannot bypass the byte limit, and read failure stops later files.
- `git diff --check`: passed.

No new iOS runtime size-limit test was performed in this pass. Earlier native
import journeys remain separately documented above. No Android work is required.

### Interrupted import recovery (2026-09-17)

Duplicate review now distinguishes independently identified watches from the
same source account (Trakt event IDs, Letterboxd diary IDs, or separate records
in the same file). Different files/accounts/sources and Letterboxd summary versus
diary overlaps still require review when their watch identity is uncertain.

Browser coverage imports 60 synthetic Trakt events using captured catalogue
metadata. It verifies both failure before the second batch saves and a lost
response after the first batch commits. Retrying produces exactly 60 unique
events in both cases. Results say "not confirmed" rather than asserting that
an unacknowledged write was not saved.

The real iOS import modal and Files picker were exercised in the isolated
in-memory QA harness, with no live account or database writes. The first import
saved 50 events and interrupted the final 10. Selecting the same file again
showed 10 new and 50 existing entries with confirmation enabled. The retry
reported 10 added, 50 duplicates skipped and 0 not confirmed; the harness logged
eventCount=60 and uniqueCount=60. This proves the native UI retry path, not
durability across process termination or live network/database behaviour.

- `pnpm run test:unit`: 928 passed (304 web, 624 core), after the retry logic change.
- `pnpm run check`: passed after the result-copy update, existing lint warnings only.
- `pnpm --filter @plot/mobile run typecheck`: passed.
- `pnpm --filter @plot/web exec playwright test tests/smoke/history-import.spec.js tests/smoke/list-import.spec.js`: 21 passed.
- `git diff --check`: passed.

### Native streaming transport and unresolved episodes (2026-09-17)

An isolated synthetic Netflix CSV containing a film and an ordinal-free TV
entry was selected through the actual iOS Files picker. Captured catalogue
responses supplied the matches. Preview showed Saint as one new entry with an
unknown watch date, and High Potential as one unmatched entry with the explicit
explanation that the episode could not be reliably identified and would be left
out to avoid marking the whole series watched. Confirmation saved exactly one
watch, with watched_at=null and no source rating. The corrected singular result
text rendered as "1 entry added".

This is native transport and exclusion-policy evidence, not an authentic current
Netflix export sample or a live database test. The other streaming providers
still have shared synthetic pipeline coverage only. No production data changed.

### Current production function comparison (2026-09-17)

`pnpm run db:function-diff`, with credentials injected from the existing local
.env and an isolated local socket/port, exited 0 against a fresh production
copy. All six pending migrations applied, including imported annotations.
The comparison listed 12 new functions and no changed or dropped existing
functions. The dump reported zero stderr lines; the restore reported five
stderr lines, which this command does not print. Consequently this records
successful migration application/function comparison, not a separate clean
full-backup restore certification. The temporary database was torn down.
Production was read only. The first sandboxed attempt could not start local
PostgreSQL; the approved unrestricted rerun completed.

Additional current static gates passed:
- `pnpm run migrations:check`: 104 migrations scanned.
- `pnpm run db:block-clause`: seven filtered identity functions, eight documented exemptions.
- `pnpm run core:check`: 579 imports resolved and no duplicate core exports.
- `pnpm run copy:check`: 405 shared strings checked.

### Omitted matches remain visible in results (2026-09-17)

Both apps now retain the unmatched-entry count in the final shared result text,
including entries explicitly left out during review. The iOS preview also counts
only unmatched records as unmatched; deselected list memberships no longer
inflate that count. Existing per-list omission reports remain separate.

The updated real iOS result screen showed "1 entry added · 0 duplicates skipped
· 0 not confirmed · 1 left out without a confirmed match" for the earlier mixed
streaming import. The native component refreshed with its existing result state.

`pnpm run check`, mobile typecheck and `git diff --check` passed. The full browser
run passed the existing 29 tests; the new test initially failed because it used
the native button selector instead of the web dropdown. After correcting that
test selector, `pnpm --filter @plot/web exec playwright test tests/smoke/history-import.spec.js --grep 'results retain entries'`
passed (one test). No application changes followed the full browser run.


### Native IMDb watchlist membership (2026-09-17)

A synthetic row using the sample-backed IMDb watchlist header and captured Red
Desert catalogue match was selected as watchlist.csv through the iOS Files picker.
Preview explicitly identified the Watchlist destination and said the title would
not be marked watched. Confirmation reported one added entry; the isolated
writer logged kind=watchlist, memberships=1, watchEvents=0, and retained the
source note "Watch together". No live account or database was used. This closes
the basic native watchlist transport check, not authenticated persistence or
complete authentic archive coverage. No application code changed in this pass.


### Approved persistent staging pilot (2026-09-17)

The approved setup is now installed, with two private QA accounts. Actual web
and iOS import screens successfully saved records into staging; independent
authenticated reads verified persistence and isolation. Real database checks
also passed reimport deduplication, unknown dates, episode identity, the five-list
allowance and private annotation isolation without new watches. See
[execution details and routing limitation](staging-import-pilot.md#execution-evidence).

Catalogue lookups were live through a local server-side bridge. The deployed
Worker-to-edge secret-authenticated path remains unverified. Interruption against
real database persistence, full native app navigation/session lifecycle and live
Trakt/Plex pilots are not established by these basic staging journeys.

### Persistent recovery and complete web navigation (2026-09-23)

`node scripts/verify-import-recovery.mjs .playwright/import-pilot` passed
against the approved staging project and existing synthetic QA accounts. The
script rejects accounts outside the synthetic import-QA namespace and uses
private, ignored credential files. It deliberately retains its synthetic records
so reruns can prove idempotency; it does not delete or modify real user data.

The first run committed a 50-record watch-event batch, discarded its successful
response, and blocked the remaining requests from a 101-record selection. The
pipeline reported all 101 as unconfirmed. A new authenticated client then retried
the complete selection: 50 duplicates and 51 new events, exactly 101 source keys.
A subsequent run reported 101 duplicates and no new watches. Dates remained
unknown, episode ordinals survived, and the second QA account could read none of
the first account's records. Repeated execution of this harness also passed.
This proves safe file replay after interruption, not an automatically restored
preview or an unattended saved-file background job.

The private `.playwright/import-pilot/web-recovery.cjs` journey passed with Chrome:
actual login form, Home, Settings, Import watch history, file picker, duplicate
review, a deliberately aborted write request, the unconfirmed-result screen,
page reload, file reselection, successful idempotent retry, View History, and
another reload with the session retained. No uncaught page errors were recorded.
It used the existing second QA account and its two previously imported source
watches. The local-only QA server omitted the production Turnstile site key;
no production or staging authentication settings changed. The catalogue still
used the local TMDB bridge, not the deployed Worker-to-edge route.

`node --test packages/core/tests/unit/importPipeline.test.js packages/core/tests/unit/importPlatformFlow.test.js`
passed all 39 tests.

Full iOS navigation remains unverified. The isolated QA simulator booted and the
full app's Metro server started on port 8093 after an unrestricted retry resolved
sandbox watcher errors. However, the active Xcode directory did not contain
`Contents/Developer/Applications/Simulator.app`; Computer Use could not open it.
No native sign-in, import or restart success is claimed for this pass. The
missing local Simulator application needs repair before that journey can run.
Expired-session recovery and the deployed catalogue route also remain open.

`pnpm run check` passed (lint: zero errors, 189 existing warnings; web build
passed). `git diff --check` passed. No app implementation or schema changes
were needed for these checks, and nothing was committed or deployed.

### Session renewal and deployed catalogue route (2026-09-23)

`node scripts/verify-import-session-recovery.cjs .playwright/import-pilot`
checks an isolated Chrome context against the local full web app on port 5182,
configured for the existing staging QA account and deployed staging catalogue
Worker. Browser plugin was not available; regular Playwright was used. The
harness reads private ignored credentials and rejects non-QA account names.

Verified paths:
- Real sign-in form → Home → Settings → Import watch history → Trakt saved-file
  review. Successful catalogue requests went to the deployed staging Worker,
  not the local bridge, and review recognised both existing source watches.
- Expiring the cached session's `expires_at` in a new browser context forced a
  real successful Supabase refresh request; import review remained accessible.
- A separate context returned a controlled `refresh_token_not_found` response
  to token renewal. PLOT redirected to login and exposed no confirmation button
  for the previous preview. Real sign-in and file reselection then completed
  with zero inserted, two duplicates, and zero unconfirmed records.
- No uncaught page errors were observed.

The expiry and revoked-refresh conditions are controlled browser-test inputs,
not an hour-long natural JWT-expiry test or a server-side credential revocation.
No real user's session was touched. Both the authenticated catalogue probe and
core's exact publishable-key headers returned HTTP 200; the browser journey
also proved CORS and matching through the deployed Worker-to-edge route. No
secret was rotated, no code deployed, and no auth setting changed.

These checks close the earlier web session-recovery and catalogue-routing gaps.
Full native iOS navigation and restart verification remain blocked by the
missing local Simulator application. Application code required no changes.
