# security-scanning

Status: active
Branch: agent/2026-11-11-security-scanning
Worktree: ~/Developer/PLOT-worktrees/2026-11-11-security-scanning
Owner: Jacob (security), built by Claude Code
Updated: 2026-11-11

## In plain words

This adds a nightly check that every database table has its access rules switched on. It also fixes two small issues GitHub's code scanner found, limits two backup jobs to read-only access, and turns on scanning of Plot's own code, which was off.

## Done

- `scripts/staging-rls-coverage-test.sql`: fails if any table anon or authenticated can reach has RLS off.
  - It passes on Staging.
  - With a probe table created and rolled back inside the transaction, it failed as expected.
  - A follow-up check confirmed no probe table was left behind.
- `supabase/functions/_shared/plexXml.js`: decode `&amp;` last (CodeQL js/double-escaping), with a new unit test.
- `scripts/build-tokens.mjs`: escape every regex metacharacter in the selector (js/incomplete-sanitization).
- `db-backup.yml` and `storage-backup.yml`: `permissions: contents: read` (actions/missing-workflow-permissions).
- Repo setting: CodeQL default setup PATCHed to add `javascript-typescript`. A setup run was triggered, and the languages list still has to be confirmed.

## Next

1. Confirm `pnpm run check` passes and that CodeQL now lists javascript-typescript.
2. Open the PR. Once the first JS scan runs on main, triage its fresh results. The old JS alerts (xss-through-dom, incomplete-hostname-regexp) point at stale lines.

## Approvals

- Given: Savannah chose "Security scanning first" on 2026-11-11.
- Still needed: merge.

## Not changed

- The 5 Dependabot alerts (decode-uri-component, zod, glob, deepmerge, minimatch). They come through Expo or ESLint tooling. The mobile app isn't shipped and Expo versions move only with an SDK upgrade, so they're deferred to that upgrade.
