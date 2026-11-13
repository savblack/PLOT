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

"Still used" means any of:

- a whole-word match in the code on `main` under `apps/`, `packages/` or
  `supabase/functions/` (`git grep -w`). The generated
  `supabase/functions/_shared/database.types.ts` and Markdown files are skipped;
- the latest body of any SQL function, as of this migration. plpgsql resolves column and
  table names only when a line runs, so Postgres accepts a function that names a dropped
  column and it fails later in production (`20261004100000` did exactly this);
- the command of any cron job still scheduled as of this migration.

Not removals, so not flagged: a table or view dropped and recreated with the same name in
the same migration (including a view replaced by a table), a function dropped and recreated
with a new signature, temporary tables, DDL inside a function body, and `drop trigger`,
`drop policy`, `drop index`, `drop constraint`.

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
code. That is deliberate: the check errs toward a person reading the hits. Read them, and
if none are this column, acknowledge it.

## Running it

```bash
pnpm run migrations:contract
```

Options: `--base <rev>` compares with a different commit; `--files a.sql b.sql` checks
named migrations; `--report` prints without failing. `MIGRATION_CONTRACT_BASE` sets the
base from the environment.

## Replayed against history (2026-11-12)

Each migration was checked against the code as it was just before it merged
(`--base <commit that added it>^`).

Of the 30 most recent migrations (`20261014090200` to `20261111190000`), one was flagged:

- `20261017120000_private_notion_intake_and_retire_linear.sql` dropped
  `claim_marketing_linear_mirror` and `release_marketing_linear_mirror` while
  `supabase/functions/marketing-linear-mirror/index.ts` still called both. A genuine catch.

The other 29 passed, including `20261016140000` (dropped `enforce_push_premium`, unused)
and `20261111090000` (dropped and recreated `enqueue_file_import_job` with a new
signature).

Older removals it would also have stopped, each one a real use at the time:
`20260621120000` (AI features, edge functions still called them), `20260726010000` (the
`journal` to `history` rename; mobile still used `journal`), `20260814000000` (feed and
comment RPCs still in `packages/core`), `20260913120000` (For You, still in core and an edge
function), and `20260925140000` (`history.rating` retype; a safe widening, but `rating` is
everywhere, so it needs an acknowledgement).

## Limits

- It cannot see iPhone builds already installed. If mobile used the name, the
  acknowledgement should say why old builds no longer matter.
- A function dropped and recreated with a different signature is treated as a redefinition.
  Callers that pass the old arguments can still break; `db:function-diff` and review cover
  that.
- It does not catch a *later* migration that names a column an *earlier* one dropped. The
  `staging:test` suite and `db:write-paths` are the guards for that.
