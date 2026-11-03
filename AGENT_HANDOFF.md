# omdb-awards

Status: paused (code done, checkpoint pushed, no PR yet)
Owner: Hailey (product, title panel parity); Jacob reviews the migration
Branch: agent/2026-11-03-omdb-awards
Worktree: ~/Developer/PLOT-worktrees/2026-11-03-omdb-awards
Issue: https://github.com/savblack/PLOT/issues/1273
Updated: 2026-11-03

## In plain words

The title panel on web and mobile now shows a short "Awards" line (for example
"Won 4 Oscars. 159 wins & 220 nominations total") when the title has one. Plot
already gets this text from OMDb, the movie database it uses for Rotten Tomatoes
scores. It used to throw the text away. Now it keeps it. This adds no new OMDb
requests. Titles already in the 30-day cache show awards once their cached entry
expires, so the row fills in over the next month.

Savannah: nothing is live. Merging adds one empty database column on production
(the cache table only, no user data). That needs your OK.

## Done

- Migration `20261103120000_critic_scores_awards.sql`: nullable `awards text` on `critic_scores`.
- `critic-score` edge function reads `data.Awards` (OMDb `N/A` stored as null, capped at 300 chars), caches and returns `awards` on every path.
- `database.types.ts` hand-edited to add `awards`. Regenerate with `pnpm run gen:db-types` after the migration applies; the output should match.
- `@plot/core/reviews.js` `fetchCriticScore` now returns `{ criticScore|null, source|null, awards|null }`, or null when it has neither. Tests added.
- Web + mobile MediaPanel: score pill keyed on `hasCriticScore`; new awards row under the scores. Copy `MEDIA_PANEL.awards`.

## Checks

- `pnpm run check` passed
- `pnpm run test:unit` passed (all suites, 0 fail)
- `pnpm run edge:check` passed
- `pnpm run migrations:check` passed
- Not run: `pnpm run db:migration-test` (restores a production copy with real user data). Run it before merge.
- Not run: visual check in the browser. Staging's function will not return awards until the migration and function are deployed there.

## Decisions

- `title_viewed` has no `has_awards` property yet. It fires when the panel opens, before the OMDb lookup returns. Adding the property would mean delaying a Tier 1 event that the engagement cohorts rely on. Needs a decision: delay the event, or add a separate signal.
- Rows cached before the column existed are not refetched early. This keeps OMDb quota flat, as the ticket asked.

## Next

1. Run `pnpm run db:migration-test`, then apply the migration and deploy `critic-score` to PLOT Staging and check a well-known awarded film in the panel.
2. Open the PR (needs a second-agent read of the migration diff per AGENTS.md). Delete this file in the last commit before merge.
3. Deploy order: the migration must apply before the new `critic-score` deploys. Otherwise the select on `awards` fails, the cache reads as empty, and every lookup calls OMDb.

## Approvals

- Given: none beyond the ticket.
- Still needed: merge (applies a production migration).
