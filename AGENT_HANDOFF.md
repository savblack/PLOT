# Newsletter completion

Status: paused
Branch: agent/2026-10-17-newsletter-completion
Updated: 2026-10-17T12:43:14.132Z

## Next

Wait for Savannah's content approval. Before any send, refresh the chart and time-sensitive sources. Copy approved content into the appropriate draft only after approval. Sending still needs explicit approval.

## Current work

- Reviewed the Substack draft for Week of October 19 while signed in as the Plot publisher.
- Updated the weekly brief and writer prompt to require the title `Week of Month Day`, a preview line that works as the Substack description and email preheader, an overview before the featured artwork, a chart introduction carrying the issue date, and an official trailer for every Coming up title instead of promotional artwork.
- Added checks and tests for those rules, then synchronized the October source with the reviewed headline, opener order, chart date, and watchlist close.
- Existing rules already covered the exact Now on TV and Streaming heading, a broader conversation section, new titles before returning seasons, at least three Coming up titles, specific reasons to watch, the full chart link after the list, and the playful Friday-you close. They were left in place rather than duplicated.

## Verification

- Node 22.23.3: `node --test marketing/tests/the-week.test.mjs` passed.
- Node 22.23.3: `pnpm run test:marketing` passed, 271 tests.
- Node 22.23.3: `pnpm run check` passed. Existing mobile lint warnings remained warnings and no new lint errors appeared.
- The revised `marketing/newsletter/issues/2026-10-19.md` passes the newsletter rule checker. `git diff --check` and no-index whitespace checks passed.

## Codex continuation

Recovered the last user request from the Manus Studio chat: use trailers for every Coming up title and commit all newsletter updates. Manus ran out of credits before committing. Its nested checkout was clean; all edits were already in this sibling checkout. Rechecked the current source and reran verification. The old editorial.png, next-fight.gif and intermediate featured.html are not part of the final newsletter and are excluded from this commit, with local files preserved. No publishing, email send, push, merge, or new schedule is part of this continuation.
