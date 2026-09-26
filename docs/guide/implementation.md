# Free-to-air Guide: first implementation

Production integration is now prepared in [production-rollout.md](production-rollout.md).
The preview notes below document the earlier implementation.

Status: local development preview, 16 September 2026. The live `/guide` route is unchanged.

## Review locally

1. `python3 scripts/guide/import-feed.py Sydney` (or another supported capital city).
2. From `apps/web`: `PLOT_SMOKE_TEST=1 npm run dev -- --host 127.0.0.1 --port 5218`.
3. Open http://127.0.0.1:5218/guide-preview.

The importer saves ignored `.guide-cache/<region>.json` snapshots. No listings are
committed or copied into the production build. The Vite-only endpoint reads these
snapshots and never makes an upstream request per page visit. The importer reuses
files under six hours old and atomically replaces files only after validation.
The local server now imports missing snapshots and refreshes snapshots older than
six hours on demand. Concurrent requests for a region share one import; failed
attempts have a one-minute cooldown. A failed refresh serves the validated prior
snapshot with an explicit refresh-failed flag. This is local on-demand caching,
not the production scheduled ingestion service.

## Implemented

- Region selection lives on the development Settings page (`/guide-settings-preview`),
  with a small region/Change link on the Guide. Saved region persists on this device.

- Agenda, seven-day navigation, full-day/on-now controls, title search and details.
- Eight explicit capital-city regions with their own broadcast timezone.
- Draft channel selection, Apply/Cancel, explicit select-none behaviour, and per-region
  device persistence. No profile writes or migration of legacy TMDB provider selections.
- Shared instant-based filtering, overnight overlap, and response validation.
- Shared fetch lifecycle with timeout, cancellation and last-loaded data on retry failure.
- Visible loading, unavailable, stale download and empty selection states.

## Source decision and remaining validation

Source: https://i.mjh.nz/au/ and
https://www.matthuisman.nz/2017/08/nz-au-iptv-epg-files.html.
No API key or paid account is required. Savannah authorised using Matt's feeds on
16 September 2026. Proceed with integration; a permission request is not a blocker.
Explicit reuse terms have not been verified, and the absence of posted limitations
is not being recorded as an explicit licence. Keep source attribution in the Guide.

The directory provisionally keeps the five main networks' numbered TV services under
100. This excludes radio and unnumbered FAST streams but is not an authoritative
terrestrial reception database. Each market needs comparison with broadcaster lineups;
regional towns are not represented by the eight capital-city choices. Source names
can be outdated (for example SBS2). Do not automatically rename or merge identifiers
without verifying their meaning. ABC Kids/Family share a channel number with distinct
source IDs, requiring a deliberate time-sharing representation before launch.

A successful import proves parseability, not accuracy or ongoing availability.
`fetchedAt` records our download time, not the broadcaster's last schedule update.
Check daily coverage per channel, gaps, overlaps, placeholder listings and feed changes
over several days before assigning production reliability expectations.

## Next implementation work

- Server-side scheduled ingestion and durable last-valid snapshots, per-channel freshness
  and coverage metrics, and alerts for failed/stale imports. One canonical source per
  channel/region; no blind merges between competing schedules.
- Account-persisted region and stable channel IDs, replacing the legacy TMDB provider
  picker in Settings. Prepare schema changes separately for review and production approval.
- Shared core endpoint configuration and native Guide rendering. Native app remains on
  the existing Guide until this feature can ship consistently. No parity PR is open yet.
- Match title details at runtime; do not invent TMDB IDs. Wire Calendar reminders only
  after preserving the exact broadcast instant and local air date end to end.
- Authenticated shell integration, production rollout and complete web/mobile regression.

## Verification of this first pass

- `python3 scripts/guide/import-feed.py Sydney`: 26 provisional channels, 5,669 programmes.
- `python3 scripts/guide/import-feed.py Melbourne`: 26 provisional channels, 5,668 programmes.
- `node --test apps/web/tests/unit/broadcastGuide.test.js`: 5 tests passed.
- `npm run check`: lint and build passed; 191 existing lint warnings, zero errors.
- `node scripts/check-hardcoded-copy.mjs`: passed.
- `node scripts/check-core-imports.mjs`: passed.
- In-app browser: clear/apply/reload retained an empty selection; Cancel discarded a draft;
  regional switching loaded Melbourne; search and programme details worked; missing Perth
  snapshot showed unavailable rather than empty results. On-now excluded source placeholders.
- Phone viewport 390×844: document width 390, no horizontal overflow; visual inspection passed.
- Full smoke suite and native runtime testing were not run: the production Guide is unchanged.

## Source integration follow-up

- Authorisation recorded; permission-request draft removed.
- Local adapter now imports and refreshes feeds automatically, coalesces concurrent
  requests, limits failed retries and serves a validated cached snapshot on failure.
- Automatic first import of Perth passed: 26 provisional channels, 5,675 programmes.
- Browser verified Settings save and return: Perth selected and listings loaded.
- `npm run check`, guide unit tests, copy check, core import check and diff check passed.
- Settings remains a development preview, not yet an account setting. Scheduled
  production ingestion, authenticated integration and mobile parity are still pending.

## International extension

See [international.md](international.md) for the current multi-country catalog, source
adapters, live import results, verification and remaining scope. Country and market now
live in preview Settings. The initial eight-city-only instructions above describe the
first pass; additional valid importer IDs include `NZ-national`, `US-NewYork`,
`US-LosAngeles`, `US-Chicago`, `CA-Toronto`, and `GB-London` (currently unavailable).
