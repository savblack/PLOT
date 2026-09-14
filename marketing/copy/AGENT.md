# Marketing copy worker

This is the production copy contract for PLOT marketing. The production runner
is the **Claude Code CLI** (`marketing-weekly-batch.yml` runs
`--copy-runner=claude`). Codex is the local/manual default and still fully
supported; other runners are fallback/debug only. This contract is
model-agnostic; nothing here depends on which CLI is executing it.

## Job

1. Pull pending briefs:
   ```bash
   node marketing/copy/pull.mjs
   ```
2. For each entry in `marketing/copy/jobs/manifest.json`, read the brief and
   write one JSON answer to `marketing/copy/jobs/<post_id>.copy.json`.
3. Save the validated answers:
   ```bash
   node marketing/copy/save.mjs
   ```
4. Stop. The next pipeline step handles render/review.

## What to write

- Social copy for `x`, `instagram`, and `threads`
- `hashtags`
- `alt_text`
- `page_title`
- `page_body`
- `sources`
- `cta_variant`

## Rules

- Follow `marketing/copy/WHATSON_GUIDELINES.md` for website-article sourcing,
  structure and post-type guidance.
- Use only the facts supplied in the brief for social copy.
- The website article can use the brief's research pack plus live web research.
- Always paraphrase in PLOT's voice.
- Never quote reviews verbatim.
- Never copy Wikipedia or synopsis text.
- List every outside source you actually used in `sources`.
- Do not edit any file other than the required `.copy.json` outputs.

## Validator constraints

- `x`: max 280 characters, no URLs, no hashtags
- `threads`: no URLs, no hashtags
- `hashtags`: 3 to 5 items, no `#` prefix
- `cta_variant`: one of `track_it`, `whats_on_tonight`, `journal_it`, `none`

`page_title` and `page_body` are additionally checked by
`supabase/functions/_shared/articleRules.js`, which rejects em and en dashes,
quoted passages and quoted titles, reception narration ("critics have…",
"according to", "reportedly"), exposed research ("could not verify"), banned
filler and trivia asides, audience scores, UK spelling, a TMDB mention, more
than two rating citations, a ratings sentence as the closer, and a Title Case
post-type label at the front of the headline. A `now_streaming`, `watch_tonight`
or `hidden_gem` post is additionally rejected if the body never says where to
watch.

The social captions (`x`, `instagram`, `threads`) are checked too, for em and
en dashes, UK spelling, narrated research, audience scores, and calling a
rental "streaming" when the post's `home_kind` says it is rent or buy, and for
calling a rental platform a "store" or "storefront". People rent in the app they
already have: name the platforms, or say "on digital".

Three things it cannot check, which are yours to get right: **no spoilers**,
**no more than three names in a sentence**, and **every time-bound claim true
on the publish date**. A person's name and a film title are the same shape to a
regex, and only you know what the reader will already have seen.

## Environment

- repo checkout with dependencies installed
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TMDB_API_KEY`
- `OMDB_API_KEY`
- Claude Code CLI authenticated on the runner (production) or Codex CLI
  authenticated on the Mac (local/manual)

## Updating these rules

This file is maintained by hand. An automated Sunday learning loop used to
rewrite it from the previous week's shipped copy; that loop has been removed, so
a rule here only changes when a person changes it.
