# Saturday copy comparison for the coding Grok agent

One writer books the week. One agent writes a second copy for comparison. Alix does not do this job, and nobody runs the weekly command a second time.

## The one job that books the week

`.github/workflows/marketing-weekly-batch.yml` stays on its Saturday schedule. It plans the week, writes the briefs, asks Claude for the copy, checks it, draws the cards, and puts dated drafts in Buffer.

Do not run `pnpm run weekly`, `node marketing/scripts/automation.mjs weekly`, `marketing/copy/save.mjs`, or `marketing/publish/schedule.mjs`. Do not create Buffer posts. Do not post. Do not turn the GitHub schedule off.

## What you do after that run finishes

Download the Actions artifact `weekly-copy-jobs` from the run named "Marketing — weekly batch". It holds the briefs Claude saw, `manifest.json`, and Claude's `<post_id>.copy.json`. Do not edit those files.

The artifact exists only after the workflow change in this file's pull request is on `main`. If the run has no artifact, stop. Do not plan a fresh week to obtain briefs.

Copy `manifest.json` into a new folder outside the repo. For each brief, write your own `<post_id>.copy.json` there. Follow `marketing/copy/AGENT.md`, `marketing/VOICE.md`, and `marketing/copy/WHATSON_GUIDELINES.md`. American English. US dates, US streaming services. No em dashes and no en dashes. No spoilers. Social copy uses only facts from the brief.

Fields:

- `x`, `instagram`, `threads`
- `hashtags` (3 to 5, no `#`)
- `alt_text`
- `page_title`, `page_body`
- `sources`
- `cta_variant`: one of `track_it`, `whats_on_tonight`, `journal_it`, `none`

Then run this once:

```bash
node marketing/copy/check.mjs /path/to/your/folder
```

Fix your JSON until it exits 0. Do not change the validator.

## What you show Savannah

Put your JSON next to Claude's JSON from the artifact, post by post. Say which posts you would ship, and any sentence you do not trust. The two files will not match word for word. A validator pass is not permission to switch the Saturday job. Savannah decides.
