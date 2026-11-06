# omdb-awards

Status: paused (PR #1458 ready for Savannah's merge OK; all checks green)
Owner: Hailey (product, title panel parity); Jacob reviews the migration
Branch: agent/2026-11-03-omdb-awards
Worktree: ~/Developer/PLOT-worktrees/2026-11-03-omdb-awards
Issue: https://github.com/savblack/PLOT/issues/1273
Updated: 2026-11-06

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

- Migration `20261106120000_critic_scores_awards.sql` (renamed from `20261103120000` on 2026-11-06 so it sorts after main's `20261103130000`, which production already applied; Staging's ledger row renamed to match): nullable `awards text` on `critic_scores`.
- `critic-score` edge function reads `data.Awards` (OMDb `N/A` stored as null, capped at 300 chars), caches and returns `awards` on every path.
- `database.types.ts` hand-edited to add `awards`. Regenerate with `pnpm run gen:db-types` after the migration applies; the output should match.
- `@plot/core/reviews.js` `fetchCriticScore` now returns `{ criticScore|null, source|null, awards|null }`, or null when it has neither. Tests added.
- Second-agent review (2026-11-04) found two edge-function risks, both fixed: an unreadable cache now returns nulls without calling OMDb (covers deploying the function before the migration), and OMDb error replies (quota, bad key) no longer overwrite a good cached row.
- Web + mobile MediaPanel: score pill keyed on `hasCriticScore`; new awards row under the scores. Copy `MEDIA_PANEL.awards`.

## Checks

- `pnpm run check` passed
- `pnpm run test:unit` passed (all suites, 0 fail)
- `pnpm run edge:check` passed
- `pnpm run migrations:check` passed
- Staging (2026-11-06, Savannah said "Yes, run them"): migration applied in one transaction with its `schema_migrations` row; `critic-score` deployed to Staging only. Staging has no `OMDB_API_KEY`, so one real OMDb lookup for Parasite (2019, resolved via TMDB search, imdb tt6751668) was made locally and written to Staging `critic_scores` (99 / "Won 4 Oscars. 309 wins & 261 nominations total"). The deployed Staging function returned it, and the web panel (local dev from this branch, signed in via `staging:session`) showed the Awards row under the scores. That cache row is left on Staging as harmless test data.
- `pnpm run db:migration-test`: PASSED on 2026-11-06 after production's database came back (earlier three attempts hit pooler timeouts). Re-run after the rename and the merge of main: production has 176 applied, 1 pending (`20261106120000`), applied cleanly.
- After merging origin/main (2026-11-06): `check`, `test:unit`, `edge:check`, `migrations:check` (177 scanned) all passed again. CI "Check trigger write paths" re-run passed.
- `pnpm run db:drift`: production side clean (only `20261106120000` new, expected). Staging drift predates this PR: 6 unrecorded migrations (`20261016120000`, `20261016140000`, `20261017120000`, `20261025102415`, `20261102120000`, `20261103130000`) and ~25 schema differences. `critic_scores.awards` shows as Staging-only until this merges.
- Mobile panel not checked visually (no simulator run); typecheck and lint pass.

## Decisions

- `title_viewed` has no `has_awards` property yet. It fires when the panel opens, before the OMDb lookup returns. Adding the property would mean delaying a Tier 1 event that the engagement cohorts rely on. Needs a decision: delay the event, or add a separate signal.
- Rows cached before the column existed are not refetched early. This keeps OMDb quota flat, as the ticket asked.

## Next

1. On Savannah's merge OK: delete this file in the last commit, merge, then deploy `critic-score` to production after the migration applies.
2. Staging drift, not this PR: see the drift line under Checks.

## Approvals

- Given: Staging migration, Staging deploy and the migration test (2026-11-06).
- Still needed: merge (applies a production migration).
