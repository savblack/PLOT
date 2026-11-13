# ui-unify

Status: paused (waiting on Savannah's pick of redesign options)
Branch: agent/2026-11-13-ui-unify
Worktree: ~/Developer/PLOT-worktrees/2026-11-13-ui-unify
Owner: Jacob (CTO) for the cleanup, Hailey (CPO) for the redesign choice
Updated: 2026-11-13

## In plain words

Plot's Watch Together and Just Decide pages look like a different app from Home,
My Lists and History. Mockups with three options for each page are here:
https://claude.ai/artifact/VMDXnp5BmJJd9ekX2FS7QH (private to Savannah).
Savannah needs to pick one option per page. This branch already holds a first,
invisible cleanup: small pieces of code that several pages each typed for
themselves now come from one place. Nothing looks or behaves differently.

## Done (this branch, commit bfa289272)

- One global `.sr-only` in `apps/web/src/styles/base.css`; removed `.wt-sr`,
  `.foot-bar-sr`, `.ob-sr`, `.plans-sr`.
- `border-radius: 999px/9999px` → `var(--radius-pill)` in web CSS;
  `borderRadius: 999` → `radii.pill` in mobile tonight, DrawerMenu, ParentalGuide,
  TasteOverlapView.
- `apps/web/src/hooks/useWide.js` (`WIDE_QUERY`, `isWide`, `onWideChange`,
  `useWide`) replaces five hand-typed 1024px matchMedia copies.
- `titleMeta` → `@plot/core/watchTogether.js`; `pickResultMeta` →
  `@plot/core/tonightPicker.js`. Web and mobile copies removed. Unit tests added.

## Checks

- `pnpm run check`: pass
- `pnpm --filter @plot/core run test:unit`: 1389 pass
- `pnpm --filter @plot/web run test:unit`: 633 pass
- `pnpm --filter @plot/mobile run typecheck`: pass
- Not done: visual look in a Cloudflare preview (values are identical, but the
  pill swap touches app.css).

## Next

1. Round 2 (same mockup link): Savannah liked all three Watch Together layouts and
   none of round 1's Just Decide. Recommended Watch Together = C's people-card row on
   top + A's shared shelves below + B's "nights together" later. Empty state leads
   with the off-platform invite link (share sheet), not username search. New Just
   Decide ideas D (shelves, no questions), E (solo swipe, same parts as Watch
   Together), F (one-tap moods). Waiting on her confirmation of the Watch Together
   combination and a Just Decide pick.
2. Build the pick on web in this branch, reusing `.cal-body`/`.cal-side`,
   `.hist-card`, `.discover-section-header`, `Chip`. Then the iPhone screens
   (`apps/mobile/components/watch/*`, `apps/mobile/app/(app)/tonight.tsx`),
   swapping `WatchChrome` aliases for `BackBar`/`Button`/`BottomSheet`/`Avatar`.
3. Deferred cleanup from the audit: merge `.cal-mini-card` + `.hist-card`, one
   tablet breakpoint (760/767/768), a shared web Avatar, dark-card colors (gone if
   the redesign drops the card), shared people-search hook in core.

## Approvals

- Given: the request to review, unify and mock up.
- Needed: Savannah's design pick; merge.
