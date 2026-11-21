# nav-polish

Status: in review (pull request open; do not merge until Savannah asks)
Owner: Claude Code session, for Savannah
Branch: agent/2026-11-21-nav-polish
Worktree: ~/Developer/PLOT-worktrees/2026-11-21-nav-polish
Latest pushed commit: see the branch on GitHub
Updated: 2026-11-21

## In plain words

The top menu on theplot.tv got a finishing pass. The pink "Start tracking"
button now sits evenly inside the menu bar (same gap above, below and to its
right), its words are centred properly, and the outline that shows when someone
moves through the menu with the Tab key now follows the button's round shape.
The logo also gets that outline. The menu button now says "Sign up" instead
of "Start tracking", so the page no longer shows two "Start tracking" buttons
at the top. The hero, lower-page and footer buttons keep "Start tracking".

Savannah: decide whether to open a pull request for it.

## Done

- `apps/website/nav.css`: sign-up pill is 34px tall (even 9px inset in the
  52px bar), right padding gives back the trailing 0.12em letter spacing,
  pill-shaped focus ring, focus ring on the logo.
- Same rules copied to `apps/website/title-page.css` and
  `supabase/functions/marketing-feed/index.ts` (the nav's two other copies).
- Nav button label "Start tracking" -> "Sign up" on all 10 pages, the What's
  On feed, the title pages (`pnpm run title-renderer` regenerated
  `titleRenderer.generated.js`) and `apps/website/copy/common.js` NAV.signup.
  `data-cta="nav"` is unchanged, so PostHog counts it the same way.
- What's On and title-page nav links raised from 0.7rem to 0.8rem to match
  nav.css (#1776 raised nav.css but missed the two copies).
- Title pages: title-page.css version tag bumped to its new hash (402082575e09,
  first 12 of SHA-256, set by hand) and TITLE_CACHE_VERSION 3 -> 4 so cached
  pages pick up the new menu. What's On has no version key; its cache
  (1h + 1 day stale) clears on its own.
- Checked a title page locally (/movie/the-odyssey-1368337, slug from the
  sitemap): Sign up, 12.8px links, pill 34px with 9px insets.
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
- Given: open the pull request (2026-11-21).
- Still needed: merge. The What's On and title-page changes deploy edge
  functions to production on merge.

## Next

Check the What's On feed in the Cloudflare preview (it could not be served
locally; title pages were checked). Delete this file in the last commit
before merge.

