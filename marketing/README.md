# PLOT marketing automation

This system now runs in one primary path:

1. GitHub prepares the week.
2. You review and approve in `admin.theplot.tv`.
3. The publish job checks every 5 minutes and sends only approved posts.
4. On Sunday, the learning loop compares generated copy with what actually shipped.
5. That learning updates the voice/spec before the next weekly generation runs.

The production worker is **Codex**. Local/manual commands still exist, but they
are fallback and debug tools, not the primary operating model.

## Primary flow

```text
Sunday morning publish finishes
  -> marketing-learning-prep.yml prepares the completed week
  -> local Sunday learning runner writes the Obsidian summary and updates VOICE/spec
  -> marketing-weekly-batch.yml generates the next week with the updated rules

Every day
  -> marketing-publish.yml checks every 5 minutes and sends only approved posts
```

## Operator surfaces

- **Primary operator UI:** `https://admin.theplot.tv`
- **Primary automation layer:** GitHub Actions
- **Primary copy worker:** Codex
- **Fallback/debug only:** local commands from `marketing/`

## Local commands

Run these from `/Users/savannahblack/Projects/PLOT/marketing`:

```sh
npm run doctor
npm run weekly
npm run publish -- --dry-run
npm run newsletter -- --dry-run
npm run snapshot
npm run learn:prepare
npm run learn:apply
npm run learn:assert
```

Notes:

- `npm run weekly` is the local end-to-end batch runner.
- Codex is the default copy runner.
- `--copy-command='...'` is still available for fallback/debug use.
- `npm run learn:prepare` refreshes metrics and builds the Sunday comparison artifact.
- `npm run learn:apply` waits for that artifact, writes the Markdown learning
  summary locally, updates `marketing/VOICE.md` and `marketing/copy/AGENT.md`,
  then commits those rule changes directly to `main`.

## Sunday learning loop

The Sunday learning loop is intentionally hybrid:

- **GitHub step:** prepares a structured comparison artifact for the completed week.
- **Local Mac step:** reads that artifact, writes the summary to:
  `/Users/savannahblack/Documents/Obsidian/Projects/PLOT/Marketing Automation/Learning Summaries/YYYY-MM-DD Learning Summary.md`
- **Local Mac step:** updates:
  - `marketing/VOICE.md`
  - `marketing/copy/AGENT.md`
- **Local Mac step:** commits those rule updates directly to `main`

The learning artifact includes:

- generated copy snapshots
- final approved website/article copy
- per-platform sent text and sent payload snapshots
- newsletter issue snapshots
- IG/Threads metrics where available

Applying the learning is a **manual local step** (`npm run learn:apply` on the
Mac — see the `launchd` template in step 5 of Setup). If it hasn't run, the
weekly generation does **not** block: `npm run learn:assert` logs a warning and
continues against the current voice rules (the same fallback used when no
artifact exists at all). This is deliberate — a forgotten local apply should not
stop the whole week from generating. Run `learn:apply` locally whenever you want
that week's learning folded into `VOICE.md` / `copy/AGENT.md`; until you do, the
prepared artifact simply sits unused.

> Note: this is a soft-fail as of PR #225. It previously threw and failed the
> `marketing-weekly-batch` workflow every Sunday the local apply hadn't run.

## Review and publish

- Weekly generation renders posts onto the admin desk with status `needs_review`.
- The admin desk is the source of truth for approve, reject, reschedule,
  unapprove, retry failed, publish now, and pause-all actions.
- The publish job checks every 5 minutes and sends only posts with status `approved`.
- Leaving a post untouched in review means it does not publish.

## Cadence

- Monday: `upcoming`
- Friday: `trending`
- Wednesday fixed feature: `watch_tonight`
- Saturday fixed feature: `hidden_gem`
- Tuesday / Thursday: generic question mid-slot
- Sunday: generic question lead slot

Question posts are generic everywhere. They are not tied to a specific title.

## Newsletter and metrics

- Newsletter sends are logged as weekly issue snapshots for learning.
- IG and Threads metrics are collected automatically for the Sunday learning loop.
- X is treated as copy-diff only unless a real analytics path is added later.
- Missing metrics do not block learning; copy diffs still feed rule updates.

## Output paths

- **Manual fallback artifacts:** `/Users/savannahblack/Projects/PLOT/marketing/plot-posts/<date>`
- **Preview/debug artifacts:** `marketing/preview/out`
- **Sunday learning summaries:** `/Users/savannahblack/Documents/Obsidian/Projects/PLOT/Marketing Automation/Learning Summaries`

## Manual fallback

The manual flow is still available when you need to build a day by hand, but it
is no longer a co-equal operating path. See
`/Users/savannahblack/Projects/PLOT/marketing/manual/README.md`.

## Copy contract

The copy contract is model-agnostic, but the production runner is Codex:

- `marketing/copy/pull.mjs` writes one brief per pending post
- the worker writes one `<post_id>.copy.json` response per brief
- `marketing/copy/save.mjs` validates the output and persists both:
  - `copy`
  - `generated_copy`

The validation boundary remains in `marketing/copy/schema.mjs`.

## Setup

1. Apply the Supabase migrations and deploy the functions.
2. Set secrets for Supabase, TMDB, OMDb, Buffer, Resend, the admin email, and
   `CODEX_AUTH` for the unattended GitHub Codex worker.
3. Set `ADMIN_PASSWORD` on `admin-review` for `admin.theplot.tv`.
4. Ensure Codex CLI is installed on the Mac that runs the Sunday learning writer.
5. Schedule the local Sunday runner to call `npm run learn:apply`.
   A ready-to-install `launchd` template lives at
   `marketing/ops/com.plot.marketing-learning.plist`.

## TMDB guardrail

TMDB ids are opaque. Never hardcode or guess them. Resolve them from a real API
response at runtime.
