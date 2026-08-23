# PLOT → Plex / Sonarr / Radarr download requests

Status: **design in progress.** Sections 1–4 below are settled with Savannah.
Section 5 onward is proposed but NOT yet approved. Read "Where to pick up" last.

Date: 2026-08-23

## 1. Goal

From PLOT, get a title onto a self-hosted Plex + Sonarr + Radarr stack:

- saving a title mirrors it into the user's **Plex watchlist**, and
- an explicit **Request** action sends it to Sonarr/Radarr to be downloaded.

Scope: Savannah's own homelab first, but built against the existing
`companion` / `integration_outbox` contract so it could be productised later
without a rewrite.

## 2. Decisions locked

| Question | Decision |
| --- | --- |
| Audience | Personal now, product-shaped later. No Settings UI, no docs, no support burden yet. |
| Overseerr / Jellyseerr | Not currently installed. **Willing to install Overseerr** — the design assumes it. |
| Trigger | **Explicit "Request" action.** Saving a title must NOT auto-download. |
| Status feedback | **Full status**: requested → downloading → in your library, badged in PLOT. |
| Plex watchlist mirroring | **Yes**, keep it. Saves mirror to the Plex watchlist independently of Request. |
| Approach | **A: local companion → Overseerr API.** See §3. |

### Approaches considered and rejected

- **B. Companion → Sonarr/Radarr directly.** Drops the Overseerr dependency, but
  the companion inherits TMDB→TVDB mapping (Sonarr is TVDB-native, PLOT is
  TMDB-native), quality profile ids, root folder paths, season monitoring and
  search triggering. Status feedback also gets much harder. Fallback only if
  Overseerr proves annoying to run.
- **C. Expose Overseerr publicly, PLOT pushes to it.** No local process and no
  polling latency, but PLOT-the-cloud-service would hold a credential reaching
  into the house — directly contradicting the SSRF stance already taken in
  `supabase/functions/_shared/plexConnectionPolicy.js`. Also a non-starter as a
  product feature. Rejected outright.
- **Zero-code: Overseerr's native Plex watchlist auto-request.** Ruled out by the
  two decisions above — it auto-requests *everything* on the watchlist and
  reports nothing back to PLOT.

## 3. What already exists in the repo

A lot of this was scaffolded already. Do not rebuild it.

- `supabase/migrations/20260426000000_add_media_integrations.sql` — creates
  `media_integrations` (provider `'plex' | 'companion'`), `integration_items`,
  and `integration_outbox` (single action: `plex_watchlist_add`). RLS on all three.
- **The PLOT → Plex watchlist leg is fully built** —
  `supabase/functions/media-sync/index.ts:460` (`addPlexWatchlistItem`). It goes
  through plex.tv's *cloud* API (`metadata.provider.plex.tv`), so it never
  touches the LAN. Saving a title already enqueues outbox rows.
- **Companion device-token auth already exists** — `authenticateCompanion`,
  `media-sync/index.ts:123`, with a per-IP throttle on failed attempts.
- Both clients already have Plex connect/sync/disconnect UI:
  `apps/web/src/hooks/useMediaSync.js`, `apps/mobile/hooks/useMediaSync.ts`,
  `apps/mobile/app/(app)/settings.tsx`.
- Setup notes for deploying the functions and their secrets:
  `apps/mobile/INTEGRATIONS_SETUP.md`.

### Things currently switched off

- `SHOW_MEDIA_SYNC_INTEGRATIONS = false` — `apps/web/src/launchFeatures.js:5`
  (and `apps/mobile/lib/launchFeatures.ts`).
- `media-sync` gates `start-auth` / `poll-auth` / `sync` behind
  `is_premium` (`index.ts:693`). Premium was cut from launch, so this gate needs
  a decision before anything ships. Companion auth is a separate path and is not
  premium-gated.

### Gaps found

- **`integration_items` is write-only.** `media-sync` and `trakt-sync` populate
  it; nothing in web or mobile ever reads it. The "in your library" badge is
  therefore net-new UI on both clients. The backend half is largely modelled already.
- **No way to mint a companion device token.** `authenticateCompanion` reads
  `device_token_hash` off `media_integrations`, but nothing ever writes a
  `companion` row. For personal use: a one-off insert script. Product version:
  a "pair a device" screen in Settings, deliberately left unbuilt.

## 4. Architecture (approved)

Two independent legs off one queue:

```
PLOT client
  ├─ save a title   → outbox row: plex_watchlist_add   (exists today)
  └─ tap "Request"  → outbox row: media_request         (new)
                            │
                    integration_outbox
                     ╱                ╲
        media-sync ?action=sync        companion poll (device token)
        drains plex_watchlist_add      drains media_request
                     │                          │
              plex.tv cloud API         Overseerr → Sonarr/Radarr
              (your Plex watchlist)              ↓
                                          your Plex server
                                                 │
                            companion reads status back ──┘
                            → integration_items → badge in PLOT
```

The watchlist leg runs entirely in the cloud. The request leg never leaves the
LAN except to poll Supabase outbound. They share the queue and nothing else, so
either can fail without taking the other down.

### Blocking bug — fix this first

`processOutbox` (`supabase/functions/media-sync/index.ts:471`) selects **every**
pending row for the user, then throws `Unsupported action` on anything that
isn't `plex_watchlist_add` and marks it `error`. The moment a second action type
exists, a Plex sync will eat and poison every pending `media_request` before the
companion sees it. Fix: filter on action in the query
(`.in('action', ['plex_watchlist_add'])`). One line, must land first.

### Schema changes

Small, because the tables were built for this:

- `integration_outbox.action` — add `'media_request'` to the check constraint.
  This is the only queue migration.
- Claiming reuses the `'claimed'` status already in the status enum. **No lease
  column needed** — `updated_at` is maintained by a trigger, so a row sitting in
  `claimed` for >10 min can be reclaimed as pending.
- Request status reuses `integration_items`, not a new table:
  `source = 'overseerr'`, `external_id` = TMDB id, Overseerr's status enum into
  the existing `availability` jsonb.
- `media_integrations.provider` already permits `'companion'`. No change.

Net: one check-constraint migration, one bug fix, zero new tables.

> ⚠️ Merging a migration to `main` applies it to **PRODUCTION** (~2 min). There is
> no pre-prod DB testing. Dry-run on the Staging Supabase project first.

## 5. Verified Overseerr API facts

Checked against the Overseerr OpenAPI spec on 2026-08-23, not recalled from memory:

- **Auth**: a single `X-Api-Key` request header.
- **Create a request**: `POST /api/v1/request` with
  `{ mediaType: "movie" | "tv", mediaId: <TMDB id>, seasons: "all" | [1,2], is4k: false }`.
  Routing fields (`serverId`, `profileId`, `rootFolder`, `languageProfileId`,
  `tags`) are optional — omit them and Overseerr uses the defaults from its
  Radarr/Sonarr server config.
- **Read status**: `GET /api/v1/movie/{tmdbId}` or `GET /api/v1/tv/{tmdbId}`,
  returning `mediaInfo.status`.
- **Status enum**: `1` UNKNOWN, `2` PENDING, `3` PROCESSING,
  `4` PARTIALLY_AVAILABLE, `5` AVAILABLE, `6` DELETED.

**TMDB ids are the only identifier in play, in both directions.** PLOT already
stores `tmdb_id` on every list item, so there is no id mapping anywhere in the
system. This is the main reason approach A is cheap.

Sources:
- <https://github.com/sct/overseerr/blob/develop/overseerr-api.yml>
- <https://github.com/cyanheads/seerr-mcp-server>
- <https://smarthomepursuits.com/setup-overseerr>

## 6. Homelab setup required (Savannah's side, outside PLOT)

1. **Overseerr container** — `sctx/overseerr`, port 5055, on the same Docker
   network / LAN as Plex, Sonarr and Radarr. `restart: unless-stopped`, one
   volume for `/app/config`.
2. **Overseerr setup wizard**, once:
   - Sign in with Plex, select the server, **enable library scanning** on the
     Movie and TV libraries. This is what the "in your library" badge ends up reading.
   - Add Radarr: `http://radarr:7878` (container name — Overseerr can't reach
     `localhost`), API key from Radarr → Settings → General → Security, then pick
     a quality profile and root folder. Mark default.
   - Add Sonarr the same way at `http://sonarr:8989`.
   - Root folders must already exist in Radarr/Sonarr before Overseerr offers them.
3. **Overseerr API key** — Settings → General → API Key. The only credential the
   companion needs.
4. **Leave Overseerr's Plex watchlist auto-request OFF** (Settings → Users).
   Otherwise it pulls the whole PLOT watchlist in behind your back, defeating the
   explicit-Request decision.
5. **Companion container** — alongside the others. Four env vars: Supabase
   functions URL, PLOT device token, `OVERSEERR_URL=http://overseerr:5055`,
   `OVERSEERR_API_KEY`.
6. **Firewall: nothing.** No port forwards, no reverse proxy, no tunnel, no
   dynamic DNS. The companion only makes outbound HTTPS calls to Supabase.

No Plex Pass required. Confirm during setup that requests made with the admin API
key auto-approve — a stuck "pending approval" queue looks identical to a broken
companion.

## 7. Proposed, NOT yet approved

Everything below was worked out but never presented to Savannah for sign-off.
Treat as a starting point, not settled design.

### The companion

Single-file Node service in a Docker image. Loop every ~60s:

1. `POST media-sync?action=companion-claim` with the device token → returns up to
   N pending `media_request` rows and marks them `claimed`.
2. For each: `POST` Overseerr `/api/v1/request` with
   `{ mediaType, mediaId: tmdb_id, seasons: 'all' for tv }`.
3. `POST ?action=companion-report` with `[{ id, status: 'done'|'error', last_error }]`.
4. `GET` Overseerr status for all tracked TMDB ids →
   `POST ?action=companion-status` → upsert `integration_items`.

Idempotency: Overseerr returns 409 if the title is already requested. **Treat 409
as success**, not an error.

### Client UX

- A "Request" action in `MediaPanel`, visible only when an active `companion`
  integration exists. States: Request → Requested → Downloading → On your server,
  driven by `integration_items`.
- Needed in both `apps/web/src/components/MediaPanel.jsx` and
  `apps/mobile/components/MediaPanel.tsx`.
- Add a shared reader hook (a `useMediaRequests` alongside the existing
  `useMediaSync` pair) rather than duplicating the query.
- Gate behind a new `SHOW_MEDIA_REQUESTS` flag, default `false`, in both
  `launchFeatures` files.

### Error handling

- Overseerr unreachable → row stays `claimed`, lease expires after 10 min, retried.
- Cap at 5 attempts, then `error` with the message surfaced in PLOT.
- `409` already requested → `done`.
- `404` unknown TMDB id → `error`, surfaced.
- Companion offline → rows sit `pending`; show "Waiting for your server" when the
  integration's `last_sync_at` is stale.

### Testing

- Follow the existing vitest patterns in `apps/web/tests/unit/`; `packages/core`
  already has ~342 tests.
- Unit: outbox action filtering, Overseerr payload building, status enum mapping
  (1–6 → PLOT labels), 409 handling, stale-claim reclaim.
- Companion loop against a stubbed `fetch`.

### Opportunistic fix

`resolvePlexWatchlistRatingKey` (`media-sync/index.ts:442`) filters Plex Discover
search results by type and year but then falls back to `|| items[0]`, so a
no-match silently adds the *wrong* title to the watchlist. Drop the fallback and
let it error instead. Small, worth doing while in this file.

## 8. Where to pick up

1. Get §7 reviewed and approved — companion internals, client UX, error handling,
   testing. Nothing there is settled.
2. Then run the `superpowers:writing-plans` skill to turn this into an
   implementation plan. That is the intended next step; do not jump to code.
3. Suggested build order once planned: outbox action filter fix → migration
   (Staging first) → device-token minting script → companion → client UX.
