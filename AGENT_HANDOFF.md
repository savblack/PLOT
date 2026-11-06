# omdb-awards

Status: paused (PR #1458 ready for Savannah's merge OK; all checks green)
Owner: Hailey (product, title panel parity); Jacob reviews the migration
Branch: agent/2026-11-03-omdb-awards
Worktree: ~/Developer/PLOT-worktrees/2026-11-03-omdb-awards
Issue: https://github.com/savblack/PLOT/issues/1273
Updated: 2026-11-07

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

## Side task: Staging drift repair (2026-11-06, done here at Savannah's request)

- Applied the six migrations Staging was missing, oldest first, each in one transaction with its `schema_migrations` row: `20261016120000`, `20261016140000`, `20261017120000`, `20261025102415`, `20261102120000`, `20261103130000`. All succeeded. They also removed the Staging-only `enforce_push_premium` trigger and the `marketing_linear_mirror` lease/functions/cron, exactly as production already had.
- `pnpm run db:drift` after: Staging 177/177 recorded. Remaining: `critic_scores.awards` Staging-only (this PR, expected until merge), and 4 objects defined differently: `bucket:feedback-attachments`, `cron:brevo-lifecycle-sync`, `cron:marketing-notion-mirror`, `cron:plot-import-worker`.
- 2026-11-07, read-only look at production (Savannah approved; `begin transaction read only` ... `rollback`):
  - `feedback-attachments`: production private. That comes from `20261025120000_feedback_attachments_private.sql`, which landed on main with #1435 on 2026-11-06 and production applied. Applied it on Staging with its ledger row, so the bucket now matches.
  - Three cron jobs run LESS often on production than the repo defines, with no migration, PR or issue on record:
    - `brevo-lifecycle-sync`: production `17 * * * *` (hourly); repo `17 3 * * *` (daily, `20261013190000`). Production is on the pre-`20261013190000` schedule.
    - `marketing-notion-mirror`: production `*/15 * * * *`; repo `*/5 * * * *` (`20261005180000`).
    - `plot-import-worker`: production `*/5 * * * *`; repo `* * * * *` (`20261015090000`).
    - Commands and `active` match; only the schedules differ. Nothing changed on either project.
  - Decision needed (Savannah or Jacob): keep production's schedules and land a migration that records them (then Staging follows), or reset production to the repo's. Note: hourly Brevo sync is 24x the repo's daily rate, opposite to the other two.
- Branch synced with main again (`8eda4572f`). Checks, `db:migration-test` (production 177 applied, only `20261106120000` pending, PASS) and `db:drift` re-run: only the 3 crons and the expected `critic_scores.awards` remain.

## Approvals

- Given: Staging migration, Staging deploy and the migration test (2026-11-06).
- Still needed: merge (applies a production migration).
