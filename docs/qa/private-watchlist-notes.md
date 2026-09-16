# Private watchlist notes

Implements the selected inline concept from commit `5a26b9d` on
`codex/watchlist-private-notes-mockups`. Notes are Free, separate from reviews,
and stored once per account, TMDB ID and media type.

## Behaviour

- Web Want to Watch uses compact title rows with an inline private note.
- Native Want to Watch exposes the same editor below the title row.
- Both title-detail panels expose notes, including after watching or removing a title.
- Save, edit, cancel and explicit delete; 1,000 Unicode code points maximum.
- Failed saves preserve the draft. Conflicts require loading the latest note,
  rather than silently overwriting another device's change.
- Notes are never attached to shared title/list objects, feeds or reviews.
- Web note DOM is blocked from PostHog autocapture/replay. Notes and export
  network responses are excluded from replay network recording. Native has no
  interaction autocapture or session replay enabled.
- JSON and CSV personal exports include notes. The notes export is paginated.
- Deleting a note clears its text and retains a revision tombstone, so an older
  editor cannot resurrect it. Account deletion cascades to the notes table.

## Verification (17 September 2026)

- `pnpm run check`: lint and web build pass; 190 existing warnings, zero errors.
- `pnpm run test:unit`: 313 web and 554 core tests pass.
- `pnpm --filter @plot/mobile run typecheck`: passes.
- `pnpm run edge:check`: all 22 edge functions typecheck, shared tests and lint pass.
- `pnpm run test:smoke`: all five browser smoke tests pass.
- `pnpm run db:migration-test`: the new migration applies to a temporary production
  copy; the temporary cluster is deleted by the runner. No production writes.
- `pnpm run staging:private-notes-test`: all nine checks pass and roll back.
  Covers owner reads, movie/TV separation, stale revisions, deletion tombstones,
  cross-account reads/updates/deletes, forged ownership, an account switch during
  a save, server length validation, anonymous reads and anonymous RPC calls.
- Web component preview: save, edit/cancel, delete and failed-save draft retention.
  Integrated watchlist editor tested at 390px without horizontal overflow.
- iOS simulator: actual native component with fictional in-memory data; add,
  save, reopen and delete pass. Preview entry override was removed afterwards.
  Metro required CI mode to avoid the machine's file-watcher limit.

UI previews use fictional notes. Database tests exercise the real policies/RPC
separately in Staging; no production account was used for the write tests.

## Release

Release approved on 17 September 2026 together with the five-list limit popup.
The Supabase GitHub integration applies the migration and redeploys edge
functions on merge to main. Verify its deployment guard and the Cloudflare app
deployment before reporting the release complete. `export-user-data` must include
the notes export after deployment. No existing database function is redefined.

The list-cap notice uses the existing informational modal so it remains visible
at any scroll position. Close and Escape dismiss it and restore focus.
