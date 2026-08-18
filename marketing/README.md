# PLOT marketing automation

This system now runs in one primary path:

1. GitHub prepares the week.
2. You review and approve in `admin.theplot.tv`.
3. The publish job checks every 5 minutes and sends only approved posts.

The voice and spec rules in `VOICE.md` and `copy/AGENT.md` are maintained by
hand. They were previously rewritten each Sunday by an automated learning loop;
that loop is gone, so a rule only changes when someone changes it.

The production worker is **Claude Code CLI** (`marketing-weekly-batch.yml` runs
`--copy-runner=claude`). Codex remains the default for local/manual runs and is
still fully supported — it just isn't what CI actually invokes. Local/manual
commands exist as fallback and debug tools, not the primary operating model.

## Primary flow

```text
Sunday morning
  -> marketing-weekly-batch.yml generates the next week

Every day
  -> marketing-publish.yml checks every 5 minutes and sends only approved posts
```

## Operator surfaces

- **Primary operator UI:** `https://admin.theplot.tv`
- **Primary automation layer:** GitHub Actions
- **Primary copy worker:** Claude Code CLI in CI; Codex is the local/manual default
- **Fallback/debug only:** local commands from `marketing/`

## Local commands

Run these from `/Users/savannahblack/Projects/PLOT/marketing`:

```sh
npm run doctor
npm run weekly
npm run publish -- --dry-run
npm run newsletter -- --dry-run
npm run snapshot
```

Notes:

- `npm run weekly` is the local end-to-end batch runner.
- Codex is the default copy runner **for local runs only** — pass
  `--copy-runner=claude` to match what CI actually uses in production.
- `--copy-command='...'` is still available for fallback/debug use.

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

- Newsletter sends are logged as weekly issue snapshots.
- Every logged issue is also published at `theplot.tv/newsletter/<week_start>`,
  with an index at `theplot.tv/newsletter`. Rendered by the `marketing-feed`
  edge function (reserved `newsletter` route), proxied by
  `apps/website/functions/newsletter.js`. Nothing extra to run: sending an issue
  publishes it.
- Recipients come from the `marketing_recipient_list()` RPC, not a plain select
  on `marketing_subscribers` — app opt-ins are linked to an account whose email
  can change, and the RPC resolves the current address from `auth.users`.
- Two ways to subscribe now: the forms on theplot.tv, and the in-app opt-in
  (Settings toggle + the watchlist prompt) which writes `profiles.marketing_emails`
  and is mirrored onto the sending list by a database trigger.
- **No opt-in surface states a send frequency**, because `npm run newsletter` has
  no cron behind it — the digest goes out when someone runs it. If a schedule is
  added (a workflow on a cron, like `marketing-publish.yml`), the copy can start
  promising a cadence again: `packages/core/copy/settingsView.js`
  (`marketingEmails`), the archive strings in
  `supabase/functions/marketing-feed/index.ts`, and the homepage newsletter hint
  and success message in `apps/website/index.html`.
- The trending chart page carries no cadence claim either, for the same reason:
  `marketing/snapshot/write-snapshot.mjs` is also manual.
- IG, Threads, and X are all copy-diff only — none has a $0 auto-collected
  analytics path (the Meta-direct token/insights pipeline for IG/Threads was
  retired; it depended on a 60-day token refresh that was never wired back up
  after GitHub workflows were trimmed, so it had been silently dead anyway).
- Nothing emails performance numbers on a schedule any more. `npm run mkt:report`
  still sends the report by hand (`marketing/metrics/report.mjs`) if you want it.

## Output paths

- **Manual fallback artifacts:** `/Users/savannahblack/Projects/PLOT/marketing/plot-posts/<date>`
- **Preview/debug artifacts:** `marketing/preview/out`

## Manual fallback

The manual flow is still available when you need to build a day by hand, but it
is no longer a co-equal operating path. See
`/Users/savannahblack/Projects/PLOT/marketing/manual/README.md`.

## Copy contract

The copy contract is model-agnostic, but the production runner is the Claude
Code CLI (Codex is the local/manual default):

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
4. Ensure Codex CLI is installed on the Mac if you want to run the local
   fallback commands (CI uses the Claude Code CLI).
5. Brevo contact sync (optional): set `BREVO_API_KEY`, run
   `DRY_RUN=1 node --env-file=.env marketing/setup/brevo-sync.mjs` first, then
   for real (note `DRY_RUN` skips the contact import, but still creates the
   lists and attributes in the live Brevo account). Copy
   the three list ids it prints into the Supabase Edge Function secrets
   `BREVO_LIST_ID` / `BREVO_MARKETING_LIST_ID` / `BREVO_WAITLIST_LIST_ID`
   (alongside `BREVO_API_KEY`) so `notify-signup`, `profiles-changed` and
   `newsletter-subscribe` can keep new/changed users, subscribers and waitlist
   signups in sync going forward. Also add `BREVO_API_KEY` as a GitHub Actions
   secret if you want the `brevo-sync.yml` manual re-run button to work.

   Run this **before** relying on the waitlist sync: Brevo silently drops
   attribute keys it does not recognise, so `WAITLIST_SOURCE` has to exist as an
   attribute before `newsletter-subscribe` can record it.

## TMDB guardrail

TMDB ids are opaque. Never hardcode or guess them. Resolve them from a real API
response at runtime.
