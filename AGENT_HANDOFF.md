# design-foundations

Status: active
Branch: agent/2026-11-09-design-foundations
Updated: 2026-11-10T00:20:00.000Z

## Next

Open the pull request for slice 1 and a mobile parity issue, then start slice 2 (Premium marker and one upgrade sheet). Details under "Remaining slices".

## In plain words

Savannah asked for the web app to stop feeling messy. A design audit on 10 Nov 2026
found that the same parts (icons, buttons, wording) were rebuilt separately on each
screen. She picked an option for each of 12 questions. This branch is the first slice
of that work: one bookmark and one heart used everywhere, and one name ("Watchlist")
for the save-for-later list. Nothing is merged. She needs to review the pull request.

## Goal

Work through Savannah's picks from the design audit
(https://claude.ai/artifact/HiFLd5F8Kj6qw6cm9zcfTj), one pull request per slice.

Her picks (verbatim, 10 Nov 2026):

- 1.1 What opens where: A. Panels for things, pages for places
- 1.2 Back and close: A. Chevron plus parent name; X always top right
- 1.4 Phone navigation: A. Bottom tab bar
- 2.1 Save control: B. Quiet: outline, then solid
- 2.2 Saving rule: A. Instant for choices, Save for typing
- 2.5 Name for the save-for-later list: A. Watchlist everywhere
- 3.1 Premium marker: B. Spark icon only
- 3.2 Premium gate: A. One upgrade sheet everywhere
- 3.3 Welcome moment: B. First-week checklist on Home
- 3.4 Billing for members: A. Membership card
- 4.1 Top of Home: A. One slot, one card at a time
- 4.2 New list flow: B. Keep the choice menu, match the dialogs

## Done in this branch (slice 1)

- `packages/core/icons.js`: one drawing each of bookmark, heart, check, as path data
  both apps can read. `apps/web/src/components/Icon.jsx` renders it on web.
- `apps/web/src/components/TitleActions.jsx`: one `SaveButton` and one
  `FavoriteButton`. Replaces the copies in MediaCard, DiscoverView (poster cards, binge
  card, hero card, chart rows), PublicProfilePage and TonightView. ListCards,
  YourPeopleView, SearchPalette, OnboardingScreen and MediaPanel use the shared icon.
- Pick 2.1 B: saved is the solid glyph in the colour the outline already has. Removed
  the accent on saved bookmarks (My Lists cards, chart rows, Your People, search
  palette), the green "In watchlist" pill, the tick that replaced the bookmark in the
  title panel, and onboarding's pink disc. The heart keeps the accent.
- Pick 2.5 A: "Want to Watch" is now "Watchlist" in shared copy, web and mobile
  strings, and the two unit tests that assert the wording. Code comments and copy keys
  (`wantToWatch`) are unchanged on purpose.
- Accessible names: the watchlist bookmark is "Add to watchlist" / "Remove from
  watchlist" everywhere (was "Add to list" on four surfaces). The search palette's
  saved marker now says "In watchlist" (was "Add to watchlist").

## Checks

- `pnpm run check` (lint + build): passed, exit 0.
- `pnpm run test:unit`: 564 web, 1,271 core, 24 script tests, 0 failures.
- `pnpm run copy:check`, `pnpm run core:check`: passed.
- Storybook, looked at by hand: onboarding save step, title panel, list card states,
  Just Decide results (button names), My Lists (section name).
- Not checked: Chromatic (quota used up), the live signed-in app, mobile on a device,
  the saved state of the title panel pill (the story's sample data cannot toggle it).

## Remaining slices

1. Slice 2: Premium marker (spark icon only, pick 3.1 B) and one upgrade sheet for
   every gate (pick 3.2 A). This also fixes the silent jumps to the plans page from
   custom artwork, history stat tiles and calendar subscribe, and gives the sheet a
   monthly/yearly choice.
2. Slice 3: navigation (picks 1.1, 1.2, 1.4): panel address in the URL so Back closes
   it, collection back stack, one back control, one page header, bottom tab bar on
   phones. Fixes the phone menu ignoring the saved order.
3. Then 2.2 saving rule, 3.3 first-week checklist, 3.4 membership card, 4.1 one slot on
   Home, 4.2 matching list dialogs.

## Watch out

- PR #1500 (onboarding loaders) also edits `apps/web/src/pages/OnboardingScreen.jsx`.
  This branch changes two lines near the poster mark. Expect a small conflict.
- PR #1453 (watching sort) edits `ListSections.jsx` and `packages/core/copy/customLists.js`.
- The bug fixes from the same audit are on `agent/2026-11-09-design-audit-bugs`.

## Approvals

- Given: the 12 picks above; "start working on my picks now".
- Still needed: review and merge of each pull request.
