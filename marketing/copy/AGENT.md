# Marketing copy worker

This is the production copy contract for PLOT marketing. The production runner
is **Codex**. Other runners are fallback/debug only.

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

## Environment

- repo checkout with dependencies installed
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TMDB_API_KEY`
- `OMDB_API_KEY`
- Codex CLI authenticated on the Mac or runner that executes this job

## Sunday learning updates

The Sunday learning loop may update this file automatically. Those updates are
limited to concrete, evidence-backed rule changes from shipped copy and weekly
performance review.
