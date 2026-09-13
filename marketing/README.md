# PLOT marketing automation

This system now runs in one primary path:

1. GitHub prepares the week.
2. You review and approve in **Linear** — one issue per post, in team PLO,
   project **Content Automation**.
3. The daily publish job sends only approved posts.

The admin desk at `admin.theplot.tv` still exists and still works. It reads the
same rows, so a decision made in either place shows up in both. Linear is a
second surface onto one database, not a second database.

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

Every 5 minutes (pg_cron -> marketing-linear-mirror)
  -> opens a Linear issue for anything needing review or waiting to publish
  -> re-renders issues whose post changed
  -> files every card in the state its row says it belongs in,
     including Done once the post has gone out

Any time
  -> you comment /approve, /copy, /reject ... on the issue
  -> marketing-linear-sync applies it to marketing_posts

Daily, 12pm Sydney
  -> marketing-publish.yml sends only approved posts
```

Nothing in the GitHub workflows talks to Linear. Both halves are Edge Functions,
so the Linear credential exists once, as a Supabase secret — and a Linear outage
can never fail a render or a publish run.

## Operator surfaces

- **Primary operator UI:** Linear — team PLO, project **Content Automation**
- **Secondary operator UI (same data):** `https://admin.theplot.tv`
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

- Weekly generation renders posts with status `needs_review`. Within five minutes
  the mirror sweep opens a Linear issue for each, in **In Review**.
- **The database is the source of truth.** Linear and the admin desk are two ways
  to write to it; the publisher reads only `marketing_posts` and the publication
  rows, so neither surface can gate a send by being unavailable.
- The publish job runs daily at 12pm Sydney and sends only posts with status
  `approved`.
- Leaving a post untouched in review means it does not publish.

### Reviewing in Linear

Comment on the issue. The first line is the command:

| Comment | What it does |
| --- | --- |
| `/approve` | Clears it to publish — the card moves to **Scheduled** |
| `/reject` | It will not publish |
| `/unapprove` | Back to needs_review |
| `/reschedule 2026-09-18` | Moves the day (the article URL keeps its original date) |
| `/publish-now` | Approves, brings it forward, kicks the publish run |
| `/retry` | Re-queues platforms that failed |
| `/regenerate` | Throws the copy away; the worker rewrites it |
| `/pause` · `/resume` | The global publishing switch — **every** post, not just this one |
| `/generate` | Build the coming week now, instead of waiting for Sunday |
| `/help` | The list, in the issue |

`/pause`, `/resume`, `/generate` and `/help` act on the whole pipeline rather
than on one post, so you can comment them on any card in the project — including
a finished one. That matters most for `/generate`, which exists for the moment
when there is nothing on the board to comment on.

`/generate` dispatches `marketing-weekly-batch.yml`, the same run Sunday's cron
fires: planning, copy and rendering take a few minutes, then the cards appear
within five minutes of that finishing. Safely repeatable — the workflow's
concurrency group queues a second run rather than racing it, and the pipeline
only fills posts that still need copy. Needs `GH_DISPATCH_TOKEN`; without it the
bot says so rather than failing quietly.

To edit copy, comment `/copy` and then only the lines you want changed —
anything you leave out stays as it is:

```text
/copy
x: the new X text
threads: the new Threads text
hashtags: A24, folkhorror, mikeflanagan
title: the new article headline
body:
First paragraph.

Second paragraph.
```

The board reads left to right as the post's life: **Review → Scheduled →
Published**, with **Canceled** for anything rejected. Backlog and Triage are
yours; the mirror never touches them.

Dragging an issue to **Scheduled** or **Canceled** does the same as `/approve`
and `/reject`. Dragging to **Published** deliberately does nothing:
publishing is something the publisher reports, so the board can never claim a
post went out when it did not.

Unlike the web desk — which writes what you type, because its editor has a live
character counter — a comment edit is validated against `copy/schema.mjs` before
it is saved. A rejected edit changes nothing and the bot replies with why.

An accepted edit lands in the database immediately; the issue body catches up on
the next mirror sweep, within five minutes.

### The weekly website refresh

`timeline-refresh.yml` opens a PR every Monday to refresh the marketing site's
timeline and hero. It used to merge itself the moment CI went green, which meant
the human it was opened *for* — a newly appended title lands with an empty note,
and the notes are a person's job — never saw it.

It still merges itself once CI is green — that has not changed. What is new is
that it also appears on this board within five minutes as an **Urgent** card
carrying the PR's own body, so a week's content change is visible somewhere you
actually look rather than only in a PR list. The card lands in Published when the
merge happens, or Canceled if the PR is closed.

The card is a record, not a gate. `/approve` is there for a refresh the automerge
left open — a run that went red and has since been fixed — and `/reject` closes
one you do not want. Both re-read the PR at that moment rather than trusting the
run from when the card was made, because a card can sit for a week while main
moves underneath it.

Both are held to the same two checks the automerge job uses: the branch must be a
`timeline-refresh/` one and the PR must have been opened by the refresh bot. The
PR a card points at comes from a Linear attachment, and attachments are editable
by anyone who can edit the issue — without those checks, commenting `/approve` on
a card you had re-pointed would merge an arbitrary pull request into main. A
comment box is not an authorization boundary.

The link between card and PR is a Linear attachment, so the PR shows on the card
in the UI and the webhook finds it by URL — there is no table of ours pairing
them. Two GitHub tokens, one per job, because the jobs need different powers and
neither should carry the other's:

| Secret | Permission | Used for |
| --- | --- | --- |
| `GH_DISPATCH_TOKEN_CONTENT` | Actions: Read and write | `/generate`, `/publish-now`, `/regenerate` |
| `GH_DISPATCH_TOKEN_WEBSITE` | Pull requests: Read and write | the website-refresh card |

Each is refused by GitHub if used for the other's work, which is the point: a
token that can merge to main has no business also being the one a slash command
hands to a workflow dispatcher. Both fall back to the single `GH_DISPATCH_TOKEN`
they were split out of. The daily probe checks each against its own endpoint, so
a token that answered 200 for the wrong one would read as over-granted rather
than healthy.

Without the WEBSITE token the card simply does not appear; the rest of the sweep
is unaffected and the run record carries `counts.pr_mirror_error`.

### Setting it up

No GitHub Actions secret is involved. Everything below is a Supabase secret.

1. Team PLO needs workflow states named **Review**, **Scheduled**, **Canceled**
   and **Published**. Each is resolved by name with its previous name accepted as
   a fallback (`In Review`, `Approved`, `Done`), so renaming a column in Linear
   is not a breaking change — there is no way to land a rename and a deploy at
   the same instant, and the sweep throws when it cannot find the review state.
   If one is missing outright the mirror fails loudly and lists the team's real
   states rather than guessing.
2. Set `LINEAR_API_KEY` as an Edge Function secret.
3. Deploy both halves:
   ```sh
   supabase functions deploy marketing-linear-mirror
   supabase functions deploy marketing-linear-sync
   ```
4. Apply the migrations. `20260912090000_schedule_linear_mirror.sql` schedules the
   sweep every 5 minutes; it reuses the Vault secrets the existing database
   webhooks already depend on, and refuses to apply if they are missing.
5. In Linear (Settings → API → Webhooks) point a webhook at
   `<SUPABASE_URL>/functions/v1/marketing-linear-sync` subscribed to **Comments**
   and **Issues**, and set the signing secret it shows you as the
   `LINEAR_WEBHOOK_SECRET` Edge Function secret.
6. Optional: `GH_DISPATCH_TOKEN` so `/publish-now` and `/regenerate` take effect
   immediately instead of waiting for the next scheduled run.

**Before changing which rows the sweep selects, dry-run it.** It reports what a
real sweep would do and touches nothing — not Linear, not the database, not the
run log:

```sh
curl -sX POST "$SUPABASE_URL/functions/v1/marketing-linear-mirror" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' -d '{"dry_run": true}'
# {"ok":true,"dry_run":true,"would":{"created":0,"refreshed":0,"moved":0,"reported":0}}
```

This exists because adding `published` to the creation set once turned a sweep
meant to move a handful of cards into one that opened 161 Linear issues — and,
through team PLO's GitHub sync, 170 issues in the repo. The blast radius of this
function is the size of `marketing_posts`, so the cheap check comes first.

A post is **complete** when it has done everything it is going to do: published
for a social post, or — for a web-only guide, which has no publication rows and
so never leaves `approved` — once its scheduled day has passed and it is live on
the site. Complete posts sit in Done; without that rule a guide would claim to be
waiting for a send that is never coming.

The row is the source of truth in both directions: a post approved or rejected
on the web desk drags its card to Approved or Canceled on the next sweep, rather
than the two surfaces quietly disagreeing. If the webhook is down, a card dragged
in Linear springs back — the drag never reached the database, and that is worth
seeing rather than hiding.

Optional overrides, all Edge Function secrets: `LINEAR_MARKETING_TEAM_ID` (PLO),
`LINEAR_MARKETING_PROJECT_ID` (Content Automation), `LINEAR_REVIEW_STATE`
(Review), `LINEAR_SCHEDULED_STATE`
(Scheduled), `LINEAR_REJECTED_STATE` (Canceled), `LINEAR_PUBLISHED_STATE`
(Published). A state
that cannot be resolved is reported in the sweep's response as `unresolved`
rather than failing it — those moves are skipped, not misfiled.

Once a day (the first sweep after 06:00 UTC) the sweep also probes
`GH_DISPATCH_TOKEN` — the PAT that lets `/generate`, `/publish-now` and
`/regenerate` take effect immediately rather than on the next cron. It is a PAT,
so it expires, and when it did nothing said so: every command fell back to "it'll
go on the scheduled run", which reads exactly like normal behaviour. It sat dead
long enough that the expiry was only found by firing `/generate` and reading a
401 out of an error message that was itself wrong about the cause.

A failed probe emails the operator and lands in the run record as
`counts.dispatch_token`. Ask for it on demand — after rotating the token, say —
with `{"check_token": true}`, which combines with `dry_run`:

```sh
curl -sX POST "$SUPABASE_URL/functions/v1/marketing-linear-mirror" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' -d '{"dry_run": true, "check_token": true}'
# {"ok":true,"dry_run":true,"would":{...,"dispatch_token":"ok"}}
```
 The probe reads a workflow rather than dispatching one —
proving write access would mean starting a real run, and a daily surprise batch
is a worse cure than the disease — so it catches an expired or revoked token
(401) and a permissions change (403/404), but cannot prove the token still has
`Actions: write`.

It lives here, in the sweep, rather than in a workflow step because Supabase
holds the token, not GitHub. A workflow would need its own copy, and duplicating
a PAT in order to watch a PAT is worse than the problem.

To check the sweep is running, read `marketing_batch_runs` — every sweep lands
there, so the newest `linear_mirror` row's timestamp is the answer. Older than
about ten minutes means the schedule has stopped:

```sql
select started_at, status, counts, error
from marketing_batch_runs
where run_type = 'linear_mirror'
order by started_at desc limit 10;
```

`idle` is a sweep that found nothing to do — most of them. Those are pruned after
24 hours by the sweep itself; runs that created, refreshed or closed an issue, and
runs that failed, are kept. Nothing prunes the *last* heartbeat, so a dead
schedule shows up as a stale newest row rather than as an empty table.

The cron job itself, if you need to look at it directly (requires the SQL editor —
the `cron` schema is not reachable over PostgREST):

```sql
select jobname, schedule, active from cron.job where jobname = 'marketing-linear-mirror';
```

A post that failed to mirror carries the reason in
`marketing_posts.linear_sync_error`, and is retried on every subsequent tick.

## Hidden gems have a ceiling, not just a floor

`planner/triggers/hidden-gem.mjs` filters on `vote_count` between `MIN_VOTES` and
`MAX_VOTES`. The floor keeps out the obscure; **the ceiling is what keeps out the
famous**, and for a while it did not exist. Since the query sorts by
`vote_average.desc`, the pool was topped by Shawshank, The Dark Knight, Pulp
Fiction and Forrest Gump — random selection within the tier was the only thing
stopping a household name going out as a "hidden gem" every week. It did not stop
Star Wars, and Inglourious Basterds was queued behind it.

12,000 is where the real picks stop and the household names start: every pick
anyone was happy with sits under 9k, and both complaints were above 22k. Nothing
lives in the gap, so the line has room on both sides rather than being tuned to
the last example. Moving it is one constant.

Review cards show the numbers behind the claim — `8.2 rating · 24,733 votes ·
2009 · Netflix` under "Highly-rated, lesser-seen: …" — because an assertion with
no evidence cannot be argued with. That is the part that generalises: it catches
the next category of bad pick too, the one there is no rule for yet.

## Cadence

- Monday: `upcoming`
- Friday: `trending`
- Wednesday fixed feature: `watch_tonight`
- Saturday fixed feature: `hidden_gem`
- Tuesday / Thursday: question mid-slot
- Sunday: question lead slot

Question posts join the conversation around a **new release that is already
out** — never something upcoming. The planner anchors each one to a real title:
something out that day, otherwise the most trending title released in the last
14 days (widening to 30 only to avoid an empty slot). A show airing new episodes
counts, judged on its latest episode rather than its premiere. The copy worker
then searches the web for that title's reception
before writing the question, so the ask is for a reaction rather than a
prediction.

If nothing released qualifies, the slot is left empty rather than filled with
speculation about an unreleased title. Questions are never about a title the
same day already covers — the one exception is a major-release day, where the
release post and the question are deliberately about the same title.

## Newsletter and metrics

- Newsletter sends are logged as weekly issue snapshots in
  `marketing_newsletter_issues`. That log is internal only — the table is
  service-role and nothing serves it.
- **There is no public archive.** The digest lives in the inbox it was sent to.
  On the site the newsletter is just a signup form, at the foot of What's On
  under `#newsletter`, which the nav and footer link to. `theplot.tv/newsletter`
  and `/newsletter/<week_start>` 301 there (`apps/website/functions/newsletter.js`
  and `newsletter/[issue].js`) so older links still land somewhere.
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

Copy that names a day the post's own schedule contradicts is rejected: a
countdown 14 days out cannot say "this Friday". `validateCopy` takes the post's
`days_until` / `when_label` and checks the claim against them, so the rule holds
whether the copy came from the worker or from a `/copy` comment in Linear.

The validation boundary is `supabase/functions/_shared/copySchema.js`, re-exported
as `marketing/copy/schema.mjs` for the Node pipeline. It lives in the functions
tree because both runtimes now enforce it: `copy/save.mjs` on the worker's output,
and `marketing-linear-sync` on copy edited from a Linear comment.

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
