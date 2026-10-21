# Weekly copy for the coding Grok agent

Savannah decided on 17 October 2026 that Grok takes the weekly writer. The weekly workflow runs on this Mac's self-hosted runner and calls `--copy-runner=grok` when `grok` is on PATH. It uses the logged-in Grok session and does not set an API key. If `grok` is missing, that run falls back to Claude and prints a warning. Generation starts at 5:30am Monday Australia/Sydney. Posts stay 9:00am America/New_York. Do not run the weekly command, `save.mjs`, or `schedule.mjs` to try the switch. A validator pass is still not the bar. The copy has to be true.

The rest of this file is the comparison assignment that produced that decision. It is not a reason to keep Claude.

## The one job that books the week

`.github/workflows/marketing-weekly-batch.yml` plans the week, writes the briefs, asks Grok for the copy, checks it, draws the cards, and puts dated drafts in Buffer. The GitHub cron is 18:30 UTC Sunday. That is 5:30am Monday Sydney during daylight time and 4:30am during standard time, and a step waits out that hour. This Mac also dispatches the workflow at 5:30am Monday Sydney, because GitHub's scheduler often starts late. A later scheduled run skips the week when one run already succeeded. At 5:30am Monday Sydney, Sunday morning in the US has passed, so the seven posts run Monday through Sunday at 9:00am Eastern.

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

Put your JSON next to Claude's JSON from the artifact, post by post. Say which posts you would ship, and any sentence you do not trust. The two files will not match word for word. That comparison is how the switch was judged. It is not a second writer.
