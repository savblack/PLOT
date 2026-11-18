# 2026-11-18-watch-together-example

Status: paused (PR open, waiting for Savannah's review)
Owner: Hailey (product: Watch Together), done by Claude Code
Branch: agent/2026-11-18-watch-together-example
Updated: 2026-11-18

## What changed, in plain words

The Watch Together panel now shows the "Deciding with Sam" example right under
the invite card, so a new person can try swiping before inviting anyone. The
"Already on Plot? Find them" link is gone. The invite card has a clearer heading
and explanation. Same change on web and the iPhone app.

## Done

- Web: apps/web/src/components/WatchTogetherHub.jsx (demo moved into the left panel, find link and its search removed; "See how it works" toggle removed since the demo is always open)
- Mobile: apps/mobile/components/watch/WatchHub.tsx (same)
- Copy: packages/core/copy/watchTogether.js (new inviteLead / inviteLeadBody; removed findOnPlot and seeHow, no other users)
- Story: apps/web/src/stories/WatchTogetherStart.stories.jsx (SearchAndInvite story removed; NobodyYet asserts the demo shows)
- No PostHog event was tied to the removed link, so none removed.

## Checks

- pnpm run check: pass
- pnpm run test:unit: pass
- pnpm --filter @plot/mobile run typecheck: pass
- Web screenshots in Storybook (desktop + phone width): done
- iPhone simulator: not run

## Next

Savannah reviews the PR and the Cloudflare preview. Delete this file in the last commit before merge.
