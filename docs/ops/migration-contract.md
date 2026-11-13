# Expand, then contract

**In plain words:** when a change to the database merges, it goes live for every Plot user
straight away. If it deletes or renames something the app still uses, the app breaks at
that moment. This check stops such a change before it merges, unless whoever wrote it has
written down why it is safe. Savannah does not need to do anything; it runs on every pull
request.

## Why

A migration merged to `main` applies to production immediately through the Supabase GitHub
integration. The web app deploys from the same merge a little later, and iPhones keep
running older builds for weeks. A migration that removes a column the code on `main` still
reads applies cleanly, and every user hits the error from then on.

So a removal is always two steps, in two pull requests:

1. **Expand.** Add the new column, function or value. Ship code that uses the new one and
   stops using the old one.
2. **Contract.** Once that code is live everywhere it needs to be, a later migration drops
   the old thing.

## What `pnpm run migrations:contract` checks

It runs in CI (`.github/workflows/ci.yml`, step "Check migrations and cross-platform
contracts") on migrations that are new or changed compared with `main`. Migrations already
on `main` are not re-checked.

| Change in the migration | Fails when |
| --- | --- |
| `drop table`, `drop view`, `drop materialized view` | the name is still used |
| `drop function`, `drop procedure` | the name is still used |
| `drop type`, `drop domain` | the name is still used |
| `alter table … drop column` | the column name is still used |
| `alter table … alter column … type` | the column name is still used |
| rename of a table, column, view, function or type | the old name is still used |
| `alter type … rename value 'a' to 'b'` | `a` is still used |
| `add column … not null` with no default, on an existing table | always, until acknowledged |
| `alter column … set not null` | always, until acknowledged |
| a SQL function or cron job that names something an earlier migration removed | always, until it stops naming it |

"Still used" means any of:

- a whole-word match in the code on `main` under `apps/`, `packages/` or
  `supabase/functions/` (`git grep -w`). The generated
  `supabase/functions/_shared/database.types.ts` and Markdown files are skipped;
- the latest body of any SQL function, as of this migration. plpgsql resolves column and
  table names only when a line runs, so Postgres accepts a function that names a dropped
  column and it fails later in production (`20261004100000` did exactly this);
- the command of any cron job still scheduled as of this migration;
- mobile or shared core code (`apps/mobile/`, `packages/core/`) in the last 90 days, even
  if `main` no longer names it. iPhones keep running the build they installed, so a name the
  app stopped using last week can still be called. Plot has no "oldest supported build"
  gate yet; until it does, 90 days is the stand-in (`MIGRATION_CONTRACT_MOBILE_DAYS`
  changes it). This is only looked up when nothing on `main` names it.

Not removals, so not flagged: a table or view dropped and recreated with the same name in
the same migration (including a view replaced by a table), a function dropped and recreated
with a new signature, temporary tables, DDL inside a function body, and `drop trigger`,
`drop policy`, `drop index`, `drop constraint`.

### A later migration naming something already removed

The reverse case: a new function or cron job names a column, table or function that an
earlier migration dropped or renamed, and nothing has brought back. Postgres accepts the
function and it fails the first time that line runs. This is exactly the outage of
`20261004100000`, which set `watch_together.requester_shares_full` five days after
`20260927160000` dropped it. The check tracks what every migration creates and drops, so it
knows which names are gone. A name that is still a live column on some other table is not
counted, to avoid false alarms on common names.

If the match really is a different thing with the same name (a jsonb key, a local
variable), acknowledge it:

```sql
-- dead-name-ok: requester_shares_full (a key in the notification payload, not the column)
```

### Not-null columns

A not-null column is always flagged because "does any deployed code insert into this table
without setting it" is not something a text search can prove.

## Acknowledging

When the expand step has shipped and you are sure, say so in the migration, one line per
name, with the reason in parentheses:

```sql
-- contracts: marketing_linear_mirror_lease (the edge function that called it was deleted in #NNNN)
-- contracts: history.legacy_note (web and mobile stopped reading it in #NNNN; no iPhone build older than that can sign in)
alter table public.history drop column legacy_note;
```

A bare name or `table.column` both work. A line with no reason fails.

The match is a whole word, so a common column name (`note`, `rating`) will hit unrelated
code. That is deliberate: the check errs toward a person reading the hits. To make that
reading short, hits for a column come sorted: lines in files that read the table by name
(`.from('history')`, `'history'`, `/rest/v1/history`) come first and are marked `code*`,
with a count. For `history.note` that is 109 of 690 lines. Read the marked ones; if none
are this column, acknowledge it.

## Running it

```bash
pnpm run migrations:contract
```

Options: `--base <rev>` compares with a different commit; `--files a.sql b.sql` checks
named migrations; `--report` prints without failing. `MIGRATION_CONTRACT_BASE` sets the
base from the environment.

## Replayed against history (2026-11-12, again 2026-11-13 with every rule)

Each migration was checked against the code as it was just before it merged
(`--base <commit that added it>^`).

Of the 30 most recent migrations (`20261014090200` to `20261111190000`), one was flagged:

- `20261017120000_private_notion_intake_and_retire_linear.sql` dropped
  `claim_marketing_linear_mirror` and `release_marketing_linear_mirror` while
  `supabase/functions/marketing-linear-mirror/index.ts` still called both. A genuine catch.

Every rule, including the mobile history and the dead-name rule, was on for the second run;
the result was the same. The other 29 passed, including `20261016140000` (dropped `enforce_push_premium`, unused)
and `20261111090000` (dropped and recreated `enqueue_file_import_job` with a new
signature).

The dead-name rule, run over all 188 migrations, flags exactly one:
`20261004100000_watch_together_mutual_follow_share.sql`, the outage described above.

Older removals it would also have stopped, each one a real use at the time:
`20260621120000` (AI features, edge functions still called them), `20260726010000` (the
`journal` to `history` rename; mobile still used `journal`), `20260814000000` (feed and
comment RPCs still in `packages/core`), `20260913120000` (For You, still in core and an edge
function), and `20260925140000` (`history.rating` retype; a safe widening, but `rating` is
everywhere, so it needs an acknowledgement).

## Limits

- It cannot see which iPhone builds are installed. The 90-day history window is a stand-in;
  an acknowledgement for a name mobile used should say why old builds no longer matter.
- A function dropped and recreated with a different signature is treated as a redefinition.
  Callers that pass the old arguments can still break; `db:function-diff` and review cover
  that.
- The dead-name rule only knows what migrations created. A column added by hand in the
  dashboard, or created by `create table … as select`, is invisible to it; it can only
  under-report in that case, not raise a false alarm.
