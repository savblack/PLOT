# nav-polish

Status: paused (ready for review; no pull request opened yet)
Owner: Claude Code session, for Savannah
Branch: agent/2026-11-21-nav-polish
Worktree: ~/Developer/PLOT-worktrees/2026-11-21-nav-polish
Latest pushed commit: 26404aafe (plus this handoff update)
Updated: 2026-11-21

## In plain words

The top menu on theplot.tv got a finishing pass. The pink "Start tracking"
button now sits evenly inside the menu bar (same gap above, below and to its
right), its words are centred properly, and the outline that shows when someone
moves through the menu with the Tab key now follows the button's round shape.
The logo also gets that outline. Nothing else about the menu changes.

Savannah: decide whether to open a pull request for it.

## Done

- `apps/website/nav.css`: sign-up pill is 34px tall (even 9px inset in the
  52px bar), right padding gives back the trailing 0.12em letter spacing,
  pill-shaped focus ring, focus ring on the logo.
- Same rules copied to `apps/website/title-page.css` and
  `supabase/functions/marketing-feed/index.ts` (the nav's two other copies).
- `pnpm run footer` restamped the `nav.css?v=` tags on every page.
- Measured in the browser at 1280px: pill 34px, 9px top/bottom/right, label
  inset 15.4px each side. Phone menu unchanged.

## Checks

- `pnpm run check`: pass
- `pnpm run edge:check`: pass (42 functions)
- `impeccable detect --changed`: no findings in the nav (all 100 are elsewhere
  on the pages, pre-existing)

## Approvals

- Given: polish the menu bar.
- Still needed: whether to open a PR. The What's On change deploys an edge
  function to production on merge.

## Next

Open a PR if Savannah wants it. Then check the What's On feed and a title page
in the Cloudflare preview (they could not be served locally).

Noticed, not changed: the What's On feed and title pages use 0.7rem nav links;
the rest of the site uses 0.8rem, though nav.css says they match.
