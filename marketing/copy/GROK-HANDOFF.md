# Saturday copy comparison for Alix

Alix is the CMO. This week she writes a second version of the Saturday posts so Savannah can compare it with the version the GitHub job already wrote. She does not publish, and she does not turn that job off.

A coding agent does not do this job. Do not hand this file to Cursor, Claude Code, or Codex and ask them to write the week's copy.

## What stays running

The GitHub workflow `.github/workflows/marketing-weekly-batch.yml` stays on its Saturday schedule. It picks the titles, writes a brief for each post, asks Claude for the copy, checks it, draws the cards, and puts dated drafts in Buffer. That is the only writer allowed to book the week.

## What Alix needs before she can start

The briefs live on the Mac runner and are deleted when the job ends. After `marketing/copy/GROK-HANDOFF.md`'s workflow change is on `main`, the run keeps them for 14 days as the Actions artifact `weekly-copy-jobs`.

Someone downloads that artifact and pastes each brief into Alix's task, or into the chat with her. The brief is the assignment Claude saw. Alix does not invent titles, and she does not plan a second week to get some.

Until that artifact exists, there is nothing for her to answer.

## What Alix writes

For each brief, one answer with these fields:

- `x`, `instagram`, `threads`
- `hashtags` (3 to 5, no `#`)
- `alt_text`
- `page_title`, `page_body`
- `sources`
- `cta_variant`: one of `track_it`, `whats_on_tonight`, `journal_it`, `none`

She follows `marketing/copy/AGENT.md`, `marketing/VOICE.md`, and `marketing/copy/WHATSON_GUIDELINES.md`. American English. US dates, US streaming services. No em dashes and no en dashes. No spoilers. Social copy uses only facts from the brief.

She does not run `pnpm run weekly`, `marketing/copy/save.mjs`, or anything that pushes Buffer. She does not post.

## How Savannah compares

Read Alix's answer next to Claude's `<post_id>.copy.json` from the same artifact. They will not match word for word. A match means Savannah would have shipped Alix's version for that post.

`node marketing/copy/check.mjs` is a later check that the JSON would pass the same validator. Alix does not run it. A pass is not permission to switch the Saturday job.

Alix ends with a short note: which posts she would ship, and any sentence she does not trust. Savannah decides whether a later Saturday may replace the Claude copy step.
