# watch-together-green

Status: active
Branch: agent/2026-11-06-watch-together-green
Worktree: ~/Developer/PLOT-worktrees/2026-11-06-watch-together-green
Owner: Jacob (web + mobile UI), requested by Savannah 2026-11-06
Updated: 2026-11-06

## Goal

Home "Watch together" card gets a color fill instead of plain cream. Savannah suggested the accent green.

## Done

- Web `apps/web/src/components/WatchTogetherHomeCard.css`: card fill is `--accent-secondary-fill` (sage green, same as watched chips), text in `--on-accent-secondary-fill`, Premium tag is solid `--accent-fill` pink.
- Mobile `apps/mobile/components/WatchTogetherHomeCard.tsx`: same fill and text colors (tag was already solid pink).
- Checked visually in light and dark with a static preview using the real tokens.

## Next

- `pnpm run check` result, then commit and open a PR (Savannah decides on merge).
- Chromatic will show a diff for the WatchTogetherHomeCard story; approve it there.

## Approvals

- Savannah asked for the color change. Merge still needs her OK.
