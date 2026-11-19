# Import source sheet redesign

Status: paused (PR open, waiting on CI and a preview check)
Owner: Savannah (requested in Claude Code)
Branch: agent/2026-11-19-plex-sheet-design
Worktree: ~/Developer/PLOT-worktrees/2026-11-19-plex-sheet-design
Latest pushed commit: see `git log -1` on the branch
Updated: 2026-11-19

## In plain words

The pop-up you get when you tap an import source in Settings (Plex, Trakt,
Simkl, Letterboxd and the other uploads) was redesigned. It now has proper
margins, the import button is a compact pill instead of stretching edge to
edge, "Remove" sits apart at the bottom, and for Plex the server and profile
choices show straight away ("Loading" while they arrive) instead of the sheet
saying "Needs a server" with nothing to pick. Nothing for Savannah to do except
look at it and say whether to open a pull request.

## Done

- `apps/web/src/components/SettingsSources.jsx` (SourceDetail): body uses the
  import dialog's padding (`isp-dialog-content`); status chip stacked over its
  line; Plex picker always rendered once connected, busy until the server list
  has loaded; picker moved above the automatic toggle; one `.ss-action` block
  for the import button (+ upload hint); history in its own section; remove
  set apart.
- `apps/web/src/components/SettingsSources.css`: detail spacing, removed the
  full-width `.ss-cta` stretch, hairline above remove.
- Web only. Mobile (`apps/mobile/components/SettingsSources.tsx`) not changed.

## Checks

- `pnpm run check`: pass (exit 0)
- `pnpm run copy:check`: pass
- `npx playwright test tests/smoke/settings-sources.spec.js`: 1 passed
- Viewed the sheet at phone width on the smoke fixture page.

## Approvals

- Given: redesign the import source sheet (all sources); open the PR.
- Still needed: merge (not requested).

## Next

- Before merge: check Settings > Connections in the Cloudflare preview, and
  delete this file in the last commit.
- Possible follow-up: the same pass on the mobile sheet.
