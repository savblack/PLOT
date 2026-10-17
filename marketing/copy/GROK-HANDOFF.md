# Saturday copy comparison for a Grok agent

The Saturday marketing job stays on GitHub. You are not taking it over in this pass. You write a second set of copy from the same briefs, check it with the same validator, and stop. Savannah compares the two. The GitHub job is the only one that may plan the week and send drafts to Buffer.

This file is the assignment. Read it before you touch the marketing pipeline.

## Read these, in this order

1. `marketing/copy/AGENT.md` — the fields to write and the rules the validator enforces.
2. `marketing/VOICE.md` — how Plot sounds. It is already copied into each brief. Read it anyway.
3. `marketing/copy/WHATSON_GUIDELINES.md` — how the website article is sourced.
4. `supabase/functions/_shared/articleRules.js` — the rejects for dashes, British spelling, quoted passages, and where-to-watch.
5. The short prompt in `codexPrompt` inside `marketing/scripts/automation.mjs`. That is the whole instruction the Saturday runner gets: read `AGENT.md`, write one JSON file per brief, edit nothing else.

American English. US release dates, US streaming services, US date order. No em dashes and no en dashes in the copy.

## What the Saturday job does

Workflow: `.github/workflows/marketing-weekly-batch.yml`.

It runs at 00:30 UTC Sunday, which is Saturday evening Eastern. On a Mac runner it plans the week, writes a brief per post, asks Claude to write the copy, validates and saves that copy, draws the cards, and pushes dated drafts to Buffer. The schedule line stays. Do not delete it, and do not set the workflow to disabled.

Claude is pinned to `@anthropic-ai/claude-code@2.1.226`. There is no Grok runner in `marketing/lib/cli-runner.mjs`. Do not add one during the comparison week. The copy contract is already model-agnostic. Your output is JSON files, not a new CLI.

## Do not do these

- Do not run `pnpm run weekly` or `node marketing/scripts/automation.mjs weekly`. That plans another week and pushes another set of Buffer drafts.
- Do not run `marketing/publish/schedule.mjs`, and do not create or send Buffer posts.
- Do not run `marketing/copy/save.mjs`. That writes the live row. The Saturday job already saved Claude's copy.
- Do not post to X, Instagram, Threads, or Resend.
- Do not ask Savannah to paste an API key or token. The main checkout `.env` is the source when a connector does not have access. Do not print it.
- Stay on GitHub `savblack/PLOT`, Linear team PLO, and the Plot Buffer organization. If a connector is signed into a different account, stop.

## Where the briefs are

`marketing/copy/pull.mjs` writes `marketing/copy/jobs/<post_id>.brief.md` on the runner. Those files are gitignored. The runner deletes them when the job ends, unless the workflow uploaded them.

After the workflow change in this pull request is on `main`, a finished or failed run keeps the folder as the Actions artifact `weekly-copy-jobs` for 14 days. Download that artifact from the run named "Marketing — weekly batch". It contains the briefs Claude saw, `manifest.json`, and Claude's `<post_id>.copy.json`.

Until that workflow file is on `main`, the Saturday run does not keep the briefs. Do not invent briefs, and do not plan a fresh week to obtain some. Wait for the artifact.

## What you write

Make a new folder outside the repo, or anywhere git will not commit. Copy `manifest.json` from the artifact into it. For each brief, write `<post_id>.copy.json` in that folder. Do not edit the artifact's files. Those are Claude's answers.

Then run:

```bash
node marketing/copy/check.mjs /path/to/your/folder
```

`check.mjs` uses the same validator as `save.mjs` and does not touch the database. Fix your JSON until the command exits 0. Do not change the validator to make a file pass.

## What "matches" means

The validator passing is required and is not the comparison. Savannah still reads your JSON next to Claude's JSON from the artifact, post by post. Matching means she would let your version stand in for that week: same facts, Plot's voice, nothing the validator would reject. The two files will not be identical. Do not treat a wording difference as a failure, and do not treat a validator pass as permission to switch the job.

When you finish, tell her:

- which run the artifact came from
- how many posts passed `check.mjs`
- any post you would not ship, and the sentence that is wrong

Then stop. She decides whether a later Saturday may replace the Claude copy step. Until she says so, the GitHub schedule stays.
