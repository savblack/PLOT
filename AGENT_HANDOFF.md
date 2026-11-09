# premium-marker

Status: active
Branch: agent/2026-11-10-premium-marker
Updated: 2026-11-10T00:50:00.000Z

## Next

Wait for review of the pull request. This branch is stacked on `agent/2026-11-09-design-foundations` (PR #1504) because it uses the shared icon set from there. Merge #1504 first. The next slice of the design audit is one upgrade sheet for every Premium gate (pick 3.2 A).

## In plain words

Free users saw "Premium" marked nine different ways (pink chips, solid pills, grey chips, plain text, a padlock). Savannah picked one marker: a small spark icon with no word (design audit pick 3.1 B). This branch swaps every marker for that one spark. The padlock now only means "private". Nothing is merged.

## Done

- `packages/core/icons.js`: added `spark`.
- `apps/web/src/components/PremiumMark.jsx`: the marker. Its accessible name and tooltip are "Premium".
- Replaced with `PremiumMark`: sidebar and phone menu rows (Just Decide, Watch together), History stat tiles and drill link, Add to calendar › Subscribe, Watch together Home card and profile tile, Settings (themes row, calendar feed row), taste overlap chip ("Deeper stats" plus spark), themes gallery card tag, account menu theme swatches (was a padlock), Just Decide's Go button (was a padlock).
- Removed the old chip styles: `.app-nav-premium`, `.ep-alerts-premium`, `.wt-home-pill`, `.wt-premium`, and the inline-styled `PremiumBadge` in `SettingsView.jsx`.
- Left alone on purpose: the member's own status chip in Settings ("Premium" / "Free plan"), the profile badge, the "Needs Premium" status on Watch together partners, and the badge at the top of the Just Decide unlock card (that card is replaced in the upgrade-sheet slice).

## Checks

- `pnpm run check`: passed, exit 0 (0 errors; the 175 warnings are the existing mobile backlog).
- `pnpm run test:unit`: 564 web, 1,271 core, 24 script tests, 0 failures.
- Storybook by hand: sidebar for a Free viewer, account menu theme swatches, themes gallery (Free), Just Decide.
- Not checked: Chromatic (quota used up), the live signed-in app, History tiles and Settings rows on screen (code only).

## Approvals

- Given: pick 3.1 B, "start working on my picks now".
- Still needed: review and merge.
