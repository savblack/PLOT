# Marketing copy worker — task spec

You are the AI worker that writes PLOT's social copy. This task is **model-agnostic**:
Claude Code runs it today, but Codex or any other coding agent can run the exact
same steps. Nothing here depends on which model you are.

## Your job, start to finish

1. **Pull the work:**
   ```bash
   npm run mkt:copy:pull
   ```
   This writes one brief per pending post to `marketing/copy/jobs/<post_id>.brief.md`
   and a `marketing/copy/jobs/manifest.json` listing them. If it says "Nothing to
   do", stop here — there is no work.

2. **Write the copy.** For each entry in `manifest.json`, read its `brief` file and
   write the answer to its `output` path (`marketing/copy/jobs/<post_id>.copy.json`).
   The answer is a single JSON object with exactly the fields the brief lists. Follow
   the embedded voice guide exactly.
   - **Social fields** (`x` / `instagram` / `threads`): use only facts in the brief's
     social-facts payload — never invent dates, cast, or streaming platforms.
   - **Article** (`page_body`): write a short-to-medium blog post (4–8 paragraphs).
     Use the brief's research pack AND **do your own web research** (you may browse)
     for current reception, context, and recent news. Always **paraphrase** in PLOT's
     voice — never quote reviews or copy Wikipedia/synopsis text. List every source
     you used in the `sources` array (kept internal, not shown publicly).

3. **Save:**
   ```bash
   npm run mkt:copy:save
   ```
   This validates every answer and persists the valid ones (status → `copy_ready`).
   If it reports rejections, fix that post's JSON to satisfy the stated rules and run
   it again. Do not edit any other file.

4. **Hand off to rendering** (only if at least one post saved):
   ```bash
   gh workflow run marketing-render.yml
   ```
   This triggers the CI job that renders the cards, uploads media, and sends the veto
   digest. You are done once it's dispatched.

## Hard rules the validator enforces (so satisfy them up front)
- `x`: ≤280 chars, **no URLs, no hashtags**.
- `threads`: **no URLs** (the system appends the article link), no hashtags.
- `hashtags`: 3–5 items, no `#` prefix, Instagram only.
- `cta_variant`: one of `track_it`, `whats_on_tonight`, `journal_it`, `none`.
- Every required field present and non-empty.

## Environment this task needs (whatever runner executes it)
- Repo checked out, `npm ci` run.
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (pull/save read & write the DB).
- `gh` authenticated with `workflow` scope (step 4 dispatches the render job).

## Swapping the worker
To run this with Codex (or another agent) instead of Claude Code, point that agent's
scheduled runner at this file with the same environment above. The contract — the
`pull` → write JSON → `save` → dispatch loop — does not change.
