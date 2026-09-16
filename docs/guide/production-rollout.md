# Broadcast Guide rollout

This change replaces the actual web `/guide` and native Guide tab with the broadcast
agenda. `/guide-preview` remains a local source-evaluation tool; it is no longer the
only way to reach the new Guide.

## Architecture

- `broadcast_preferences` is a private account-owned table. It stores an explicit TV
  market and stable source channel IDs. RLS restricts reads/writes to `auth.uid()`.
  `null` channel selection means all; `[]` means none. Changing market resets channels.
  Existing `profiles.guide_channels` TMDB provider IDs are left untouched, never guessed
  or silently mapped to broadcast IDs. The old picker is removed from both Settings UIs.
- Both apps instantiate `useBroadcastPreferences` once at account-provider scope.
  Settings and Guide share confirmed state; a failed write leaves the draft open.
- Both renderers use `useBroadcastAgenda` for day boundaries, on-now filtering, query,
  missing-channel counts and stale-state decisions. All instants are UTC, displayed in
  the selected market's timezone. Overnight programmes appear on each overlapping day.
- `broadcast-guide` is a public Supabase Storage bucket containing schedule data only.
  No authenticated client can upload snapshots. The scheduled server-side importer
  validates the full replacement before uploading, retaining the prior object on failure.
  Public snapshots use a five-minute cache lifetime and a ten-megabyte size limit.
- `.github/workflows/broadcast-guide.yml` refreshes every six hours, on relevant merges
  to main, and on manual dispatch. It reuses the existing repository secrets
  `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. No browser secret is introduced.
  Bootstrap waits up to roughly four minutes for the bucket migration before failing.
  Markets refresh independently (three concurrent workers); one failure does not stop
  other markets. A failed/missing-channel refresh fails the workflow and retains a
  seven-day health artifact with per-channel coverage, gaps and overlaps. GitHub workflow failure
  notifications are the operator alert; no new outbound messaging service is installed.
- Browser requests read cached snapshots, never scrape upstream sources. Clients label
  snapshots stale after twelve hours or when coverage has expired; a failed refetch
  retains the last loaded snapshot for that region.

Source adapters and verified station provenance remain in [international.md](international.md).
All 13 enabled markets refreshed successfully on 16 September 2026 with future listings
for every channel. This proves this run, not future availability. The London adapter
still lacks a usable source and remains explicitly unavailable. Unsupported areas never
fall back to another city. Starter station lists remain labelled as incomplete. Shared channel numbers (such as
ABC Family and ABC Kids) deliberately remain separate named services with their own
source IDs and schedules; they are not merged by channel number.

## Merge and rollout

1. Review the migration and this PR. Nothing in this task has been published to production.
2. On approval to merge, the normal Supabase integration creates the private preferences
   table and public schedule bucket. The relevant-main-push workflow bootstraps snapshots;
   the web Pages deployment enables the new route. These deploys are asynchronous. Until
   migration/import finish, the app reports settings/listings unavailable and permits retry.
3. Require a successful `Refresh broadcast Guide` run, inspect its health artifact, then
   check the deployed Guide with an explicit market, select-none/reload and a market change.
   A failed run can be manually rerun after correcting its source/infrastructure issue.
4. Deploy the updated `export-user-data` edge function after the migration so account
   exports include broadcast preferences. Account deletion already cascades from `auth.users`.
5. Ship the native app through the normal approved release process. Merging JS does not
   itself publish an iOS or Android build/update.

Rollback: revert the route/Settings changes if required and pause the workflow. Keep the
additive table and bucket so saved preferences survive. Do not delete user preferences
or snapshots as part of an automatic rollback.

## Checks

- `pnpm run check`, `pnpm run test:unit`, `pnpm --filter @plot/mobile run typecheck`
- `pnpm run test:guide` (provider/importer validation and last-valid upload behaviour)
- `pnpm run db:migration-test` (production read into a temporary local cluster)
- `pnpm run staging:broadcast-test` (migration and owner/other/anonymous/storage-policy
  assertions in a single Staging transaction ending in rollback)
- `pnpm --filter @plot/web exec playwright test` (production-route Guide and Settings
  tests use intercepted fake account data; config forces a placeholder backend even
  when CI has production secrets)
- Existing token/copy/core/mobile-tab/migration/security guards.
- iOS simulator debug build and isolated native renderer checks with real Sydney listings:
  programme details, clear/apply channels, and save a changed market. The harness used
  in-memory preferences and was removed afterward; no live account was modified.

No Calendar reminder or TMDB matching action is introduced. Programme details show the
source title, description, channel and exact broadcast interval. These features can be
added independently once broadcast identity and time semantics are preserved.
