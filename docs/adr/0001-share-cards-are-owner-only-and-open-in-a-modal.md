# ADR 0001: Share cards are owner-only and open in a modal, not a page

- **Status:** accepted
- **Date:** 2026-09-29
- **Decided by:** Savannah (author), on the share-paths canvas

## Context

Plot is adding shareable stat cards (Highlights, Streak, Activity, You vs the crowd,
Top 5 movies / TV, Genres, Your person, Month wrap) for X, Threads and Instagram
Stories. See `docs/design/share-cards.md` for the cards and the paths to them.

Two questions came up while designing the user path:

1. Should the share sheet be its own route (`/share`), or a modal over whatever page
   the user is on?
2. Can anyone other than the account owner generate and share that account's cards?

## Decision

**The sheet is a modal.** On web it opens over the current page; on mobile it is a
bottom sheet. It is reachable from a share icon on each History insight card, from a
Share menu on the user's own profile, from the streak toast, and from the month-wrap
notification. Notifications and pushes reach it through a query parameter
(`?share=<card>`) on the page they would open anyway. There is no `/share` route.

**Cards are owner-only.** The Share-a-card entry only appears on the viewer's own
profile and own History. Nobody can open the sheet for another account, and no card
is generated from another user's history.

## Consequences

- One component to maintain and one place to open it from; the card stays next to
  the thing it describes.
- Deep links carry state in a query param, so a notification can still land the
  user on a preset card without a dedicated page.
- The cards never leak private history: every card is built from the viewer's own
  rows, under the viewer's own session, on the client. The Top 5 card's data is
  already public on the profile, but it follows the same rule for consistency,
  because the point of a card is that its owner posts it.
- Anything that would want to show another user's card (a feed post, an OG image
  for their profile) is a separate feature with its own decision, not an extension
  of this one.

## Rejected

- A standalone `/share` page: one more surface, and it separates the card from the
  stat it comes from.
- Letting followers share a friend's Top 5: tempting for reach, but it breaks the
  "your history is yours" rule the profile privacy settings already promise.
