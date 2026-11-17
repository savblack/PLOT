# new-releases-jump-panel

Status: paused
Branch: agent/2026-11-16-new-releases-jump-panel
Worktree: ~/Developer/PLOT-worktrees/2026-11-16-new-releases-jump-panel
Updated: 2026-11-17

## In everyday words

Savannah looked at a mockup and chose something simpler: on the web New
Releases page the "Jump to" card is removed, and the Show / Genre filter is
the only thing in the side column, drawn as a proper card (panel). The
earlier pills, phone row and genre merge were all undone.

## Done

- `apps/web/src/components/NewReleasesView.jsx`: Jump to card removed; filter
  section uses `hist-card new-releases-filter-card`.
- `apps/web/src/styles/app.css`: `.new-releases-filter-card`; jump rules removed.
- Core, copy, tests and the jump component/hook/story are back to main's state.

## Checks

- `pnpm run lint`: 0 errors. NOT run after this change: `pnpm run check`
  (build), `pnpm run test:unit`. NOT looked at in a browser.

## Next

1. Run `pnpm run check` and look at the card (padding is a first guess:
   18px 8px 10px).
2. Open question for Savannah: she said the four top sections (Last 30 Days,
   Most Binged Shows, Now Showing, Top 10 by Platform) are "already on the
   home page". Does she want those sections removed from the New Releases
   page itself? They are still there. Check Home really shows them first.
3. Merge origin/main (branch is a few commits behind), then PR on her yes.
4. Delete this file in the last commit before merge.

## Approvals

Needed: Savannah's yes before a pull request or merge.
