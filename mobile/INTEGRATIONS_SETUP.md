# Activating Plex / Trakt (and Calendar) on mobile

The mobile client for these is built (Settings → Integrations, Settings → Calendar),
but three of them call **Supabase edge functions** and Trakt needs an **OAuth app**.
The client code is inert until the steps below are done. Nothing here is a code
change — it's dashboard config + function deploys.

- Supabase project ref: **`mkegtssedjyqldysvzga`**
- Edge functions live at the monorepo root: `supabase/functions/{trakt-sync,media-sync,calendar-feed}` (one level up from `mobile/`)
- App deep-link scheme: **`plot`** (so the Trakt redirect is `plot://auth/trakt`)

Prereq: `supabase login` and `supabase link --project-ref mkegtssedjyqldysvzga`
(run from the monorepo root, where the `supabase/` functions live).

---

## 1. Trakt

### 1a. Trakt OAuth app
1. Go to https://trakt.tv/oauth/applications → your PLOT app (or create one).
2. Under **Redirect URI**, add the mobile scheme on its own line (keep the existing web one):
   ```
   https://app.theplot.tv/auth/trakt      ← existing (web)
   plot://auth/trakt                       ← ADD THIS (mobile)
   ```
   This must match `TRAKT_REDIRECT_URI` in `hooks/useTraktSync.ts` exactly.
3. Copy the **Client ID** and **Client Secret**.

### 1b. Mobile env (client)
Add to `.env` (the client only needs the public Client ID):
```
EXPO_PUBLIC_TRAKT_CLIENT_ID=<trakt client id>
```
Then rebuild the app (env is inlined at build time):
`LANG=en_US.UTF-8 npx expo run:ios` (or restart Metro + reload).

### 1c. Supabase function secrets (server)
```
supabase secrets set \
  TRAKT_CLIENT_ID=<trakt client id> \
  TRAKT_CLIENT_SECRET=<trakt client secret> \
  --project-ref mkegtssedjyqldysvzga
```
`trakt-sync` also uses `TMDB_API_KEY`, `PLEX_TOKEN_SECRET`, and the auto-provided
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` — set the first
two if not already (see §3).

### 1d. Deploy
```
supabase functions deploy trakt-sync --project-ref mkegtssedjyqldysvzga
```

---

## 2. Plex

No client-side client ID or redirect registration needed — Plex uses a PIN/device
flow entirely through the `media-sync` function.

### 2a. Supabase function secrets
```
supabase secrets set \
  PLEX_CLIENT_IDENTIFIER=<stable random UUID for this app> \
  PLEX_TOKEN_SECRET=<32+ char random string, used to encrypt stored tokens> \
  --project-ref mkegtssedjyqldysvzga
```
Optional (have sensible defaults in the function): `PLEX_PRODUCT`, `PLEX_PLATFORM`, `PLEX_VERSION`.

### 2b. Deploy
```
supabase functions deploy media-sync --project-ref mkegtssedjyqldysvzga
```

---

## 3. Shared secrets (needed by all three functions)

```
supabase secrets set \
  TMDB_API_KEY=<tmdb v3 api key> \
  PLEX_TOKEN_SECRET=<same value as §2a> \
  --project-ref mkegtssedjyqldysvzga
```
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` are injected
automatically by the platform — do not set them manually.

**Calendar** (already shipped in Settings → Calendar) uses `calendar-feed`, which
needs only `TMDB_API_KEY` + the auto-provided Supabase secrets. Deploy it too if it
isn't already:
```
supabase functions deploy calendar-feed --project-ref mkegtssedjyqldysvzga
```

---

## 4. Verify

1. **Trakt**: Settings → Integrations → Trakt → **Connect**. The system browser
   opens trakt.tv authorize; approve; it redirects to `plot://auth/trakt?code=…`,
   the app catches it (`app/_layout.tsx` deep-link listener → `exchangeTraktCode`),
   and the row flips to **Connected**. Then **Sync now**.
   - If it doesn't return to the app: the redirect URI isn't allowlisted (§1a).
   - If "Trakt isn't configured yet": `EXPO_PUBLIC_TRAKT_CLIENT_ID` isn't in the
     built bundle (§1b — rebuild).
2. **Plex**: Settings → Integrations → Plex → **Connect** → approve on plex.tv →
   the app polls and flips to **Connected**.
3. Check `media_integrations` rows exist with `status='active'`, and that
   `integration_outbox` entries (created when you save/unsave titles) get processed
   on sync.

## What the client already does (no further mobile work needed)
- `hooks/useTraktSync.ts` — connect / exchange / sync / disconnect
- `hooks/useMediaSync.ts` — Plex start-auth / poll / sync / disconnect
- `app/_layout.tsx` — global deep-link listener for the Trakt `code`
- `app/(app)/settings.tsx` — Integrations UI (status / Connect / Sync now / Disconnect)
- `lib/core/useWatchlist.js` — already enqueues Trakt outbox rows on save/unsave
