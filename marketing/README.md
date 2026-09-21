# PLOT marketing automation

Every post has two halves, and they are reviewed in different places.

1. GitHub prepares the week.
2. The social copy is pushed straight into **Buffer**, dated. You review, edit
   and delete it there; Buffer sends it.
3. The website article is reviewed in **Linear** — one issue per post, in team
   PLO, project **Content Automation**. Approving a card puts the piece on
   theplot.tv; rejecting keeps it off.

**Neither half gates the other.** A rejected article does not pull its posts out
of Buffer, and a failed send does not take the article off the site. This is
deliberate: each surface controls what it can actually show you, and nothing
claims a power it does not have.

The split is the point. Buffer has the character counter, the preview and the
calendar, so it is where a caption should be judged; it has no idea the article
exists. Linear can render 600 words of prose, so it is where the writing should
be judged; it cannot show you how a tweet will look.

`admin.theplot.tv` is still hosted. It is not where a week is reviewed. Its
Approve, Reject, and Save buttons still change publication rows in ways Linear
does not, so do not use them. The cutover is `docs/ops/retire-admin-review.md`.
Linear and Buffer are the two surfaces. The database is what they both write.

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
  -> and pushes as much of it into Buffer as the queue will hold,
     each post due at noon Sydney on its own day

Every 5 minutes (pg_cron -> marketing-linear-mirror)
  -> opens a Linear issue for each post's ARTICLE
  -> re-renders issues whose post changed
  -> files every card in the state its row says it belongs in,
     including Done once the post is finished

Any time, in Buffer
  -> you edit, reschedule or delete the social posts themselves

Any time, in Linear
  -> you comment /approve, /copy, /reject ... on the issue
  -> marketing-linear-sync applies it to marketing_posts

Daily, 12pm Sydney
  -> marketing-publish.yml asks Buffer what happened and writes it down,
     then tops the queue back up with the next posts due
```

Nothing sends any more. Buffer sends. The daily run exists to find out what it
did — Buffer has no webhook, so a post that went out, failed, was rewritten or
was deleted reaches the database only because that run goes and asks.

Nothing in the GitHub workflows talks to Linear. Both halves are Edge Functions,
so the Linear credential exists once, as a Supabase secret — and a Linear outage
can never fail a render or a publish run.

## Operator surfaces

- **Articles:** Linear, team PLO, project **Content Automation**
  (`https://linear.app/savblack/project/content-automation-2ce2d56ced11`)
- **Social posts:** Buffer (`https://publish.buffer.com`)
- **Not for review:** `https://admin.theplot.tv` is still hosted and is retiring
- **Primary automation layer:** GitHub Actions
- **Primary copy worker:** Claude Code CLI in CI; Codex is the local/manual default
- **Fallback/debug only:** local commands from `marketing/`

## Local commands

Run these from `/Users/savannahblack/Projects/PLOT/marketing`:

```sh
pnpm run doctor
pnpm run weekly
pnpm run schedule -- --dry-run
pnpm run reconcile -- --dry-run
pnpm run newsletter -- --dry-run
pnpm run snapshot
```

Notes:

- `pnpm run weekly` is the local end-to-end batch runner. It ends by pushing the
  rendered week into Buffer, so it needs `BUFFER_API_KEY`.
- `pnpm run schedule` pushes anything still queued. `--dry-run` reports what it
  would push and touches neither Buffer nor the database.
- `pnpm run reconcile` reads Buffer back. It never writes to Buffer.
- Codex is the default copy runner **for local runs only** — pass
  `--copy-runner=claude` to match what CI actually uses in production.
- `--copy-command='...'` is still available for fallback/debug use.

## Review and publish

- Weekly generation renders posts with status `needs_review`, then pushes their
  social copy into Buffer, **on the post's own day, at a time Buffer chose**. It
  pushes as many as the queue will hold; the daily run tops it up from there
  (see below).

### Who decides when a post goes out

**The day is ours. The time is Buffer's.**

The day has to be ours, because the copy is written against it and says so out
loud — "14 days until", "aired last night", "turns 15 this week". A post that
slides to the next day starts lying about itself, which is why `validateCopy`
checks day claims in the first place.

The time is Buffer's because Buffer is better placed to judge it. Each channel
carries a posting schedule — the hours Buffer recommends for that service on that
weekday, in Sydney time — and the nth post for a channel on a day takes the nth
slot:

| Channel | Slots per day | Shape |
| --- | --- | --- |
| X | 4 | mornings, ~08:00-11:45 |
| Threads | 2 | mid-morning, ~09:00-12:30 |
| Instagram | 2 | evenings, ~17:00-22:40 |

So a day's three posts no longer fire together at one hour: X goes out at 08:03,
Threads at 09:56, Instagram at 18:34. Edit those schedules in Buffer and the next
push follows them — nothing here needs changing.

**Why not just use Buffer's queue?** Because `addToQueue` lets *queue order*
decide the date. Threads has 14 slots a week against roughly 16 posts, so posts
would quietly land on days their own text contradicts. Pinning the day and
borrowing the hour keeps both judgements where they belong.

When a day has more posts than slots, the extras are spaced 45 minutes after the
last one rather than stacked on it — two posts on the same minute read as a bot,
and Instagram may drop the second. A channel with no schedule for that weekday
falls back to `SEND_HOUR_SYDNEY` in `publish/payload.mjs`.

### The send time really did change

Worth stating plainly, because the repo used to claim otherwise. The old publish
cron was `0 2 * * *` with a comment reading "12:00pm Sydney" — but GitHub's
scheduler is best-effort, and this repo's crons run **2.5-5.5 hours behind** their
stated time, every run, not occasionally. Ten consecutive publish runs all started
around 07:10 UTC. Posts have actually been going out at about **17:15 Sydney**,
not midday, for as long as anyone has been reading that comment.

Buffer honours the time it is given, so the schedule above is now what happens
rather than what was hoped for. Any engagement pattern measured before this
change was measured at ~17:15 for all three channels at once, which is not a
baseline the new times can be compared against.
- Within five minutes the mirror sweep opens a Linear issue for each post's
  article, in **Review**.
- **Leaving a card untouched means the article does not go live.** It does not
  stop the social posts: those are in Buffer and go out on their day unless you
  delete them there. Silence is a decision about the website only.
- **The database is the source of truth about what happened**, not about what
  will happen. Buffer holds the queue; the daily reconcile run reads it back into
  `marketing_post_publications`.

### The queue is a rolling window, not a week

The Buffer plan caps **10 scheduled posts per channel**, and a week of PLOT is
about **16 per channel** — roughly 2.6 posts a day, each fanning out to two or
three channels. A week does not fit, and never will on this plan.

So the queue is a rolling window. The push fills whatever room each channel has,
in `scheduled_for` order so the slots always go to the soonest posts, and the
daily job runs the push again **after** reconciling — filling the slots that
day's sends just freed. Ten slots at about 2.3 sends per channel per day works
out to roughly **four days of visible runway**: at any moment you can see and
adjust the next three or four days of posts in Buffer, and the rest arrive as
room appears.

Two consequences worth knowing:

- **The daily run is load-bearing.** It is not just bookkeeping — it is what
  drains the backlog. If it stops, the queue empties in about four days and then
  nothing goes out, even though the week generated fine.
- **A post that does not fit is not lost.** It stays `queued` in the database and
  goes in on a later run. The push reports the count rather than failing, because
  a full queue is the normal state, not an error.

Raising the plan's per-channel limit would widen the window and lengthen the
review lead time. Nothing else about the design would change.

### Editing and deleting in Buffer

This is the expected way to work. Open the post in Buffer, change the text, move
it, or delete it. Nothing needs to be told.

What that costs, stated plainly: the copy contract in `copy/schema.mjs` is not
enforced on an edit you make there. Buffer has a character counter, so the 280
limit looks after itself, but the rules a counter cannot see — no URLs on X, no
"this Friday" on a post that runs a fortnight out — are yours to hold. That is
the same trade the web desk already makes, and the reason a `/copy` comment in
Linear is validated and a Buffer edit is not.

The reconcile run notices an edit and records the text that actually went out, so
`sent_text` stays true even when it no longer matches the copy we generated.

### Reviewing in Linear

**The card is the article.** The headline, the body, the hero, the sources, and
the reason this pick was made. The social copy is not on it — not folded away,
not shown read-only, not there. Those posts are in Buffer and reviewed in Buffer;
a card that reproduced them could not change them, and showing them only invited
the belief that it could.

**Social-only posts get no card.** `question` posts have no website article —
they never get a slug and never appear on theplot.tv, they exist purely as
conversation starters on social. Since the board stopped showing social copy,
their card said "No article written yet." and nothing else: an approval prompt
for a page that does not exist, three a week. The sweep now opens cards only for
posts with a slug, which is exactly the set that has an article (across 226 posts
the split is clean — `question` on one side, every other type on the other).

Comment on the issue. The first line is the command:

| Comment | What it does |
| --- | --- |
| `/approve` | The article goes live on its day — the card moves to **Scheduled** |
| `/reject` | The article will not go live |
| `/unapprove` | Back to needs_review |
| `/reschedule 2026-09-18` | Moves the article's day. An unpublished post's URL moves with it; a live URL stays |
| `/publish-now` | Approves and brings the article forward to today |
| `/regenerate` | Throws the copy away; the worker rewrites it |
| `/pause` · `/resume` | Stops posts entering the Buffer queue — every post, not just this one |
| `/generate` | Build the coming week now, instead of waiting for Sunday |
| `/help` | The list, in the issue |

None of these reach into Buffer. `/approve` and `/reject` decide the website
piece and nothing else; `/pause` stops new posts *entering* the queue but cannot
empty it. Changing or dropping a post that is already scheduled is done in
Buffer, on the post.

`/retry` is gone. It re-queued failed publication rows, which is a question about
sending — use the `retry_failed` input on `marketing-publish.yml`, or the admin
desk, both of which can actually see the queue.

`/pause`, `/resume`, `/generate` and `/help` act on the whole pipeline rather
than on one post, so you can comment them on any card in the project — including
a finished one. That matters most for `/generate`, which exists for the moment
when there is nothing on the board to comment on.

`/generate` dispatches `marketing-weekly-batch.yml`, the same run Sunday's cron
fires: planning, copy and rendering take a few minutes, then the cards appear
within five minutes of that finishing. Safely repeatable — the workflow's
concurrency group queues a second run rather than racing it, and the pipeline
only fills posts that still need copy. Needs `GH_DISPATCH_TOKEN_CONTENT`; without it the
bot says so rather than failing quietly.

To edit the article, comment `/copy` and then only the lines you want changed —
anything you leave out stays as it is:

```text
/copy
title: the new article headline
body:
First paragraph.

Second paragraph.
```

`title:`, `body:` and `cta:` are the whole vocabulary. `x:`, `instagram:`,
`threads:`, `hashtags:` and `alt:` are not fields here and never resolve to one —
a `/copy` that only names those answers "No fields to change." The parser used to
recognise them in order to refuse them; it does not know the words at all now,
which is the more honest version of the same answer.

The board reads left to right as the post's life: **Review → Scheduled →
Published**, with **Canceled** for anything rejected. Backlog and Triage are
yours; the mirror never touches them.

Dragging an issue to **Scheduled** or **Canceled** does the same as `/approve`
and `/reject`. Dragging to **Published** deliberately does nothing: a card
reaches Done when its article is actually live, which is a thing the sweep
works out, not a thing the board may assert.

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
6. Optional: `GH_DISPATCH_TOKEN_CONTENT` so `/publish-now` and `/regenerate` take effect
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

A card is **complete** when its article has done everything it is going to do:
cleared to run, and its day arrived — so it is on `/whats-on`. That is the whole
rule, and it deliberately ignores the publication rows.

It used to consult them, and the reasons it stopped are worth keeping. A card
that waited on a send was tracking something it does not show you; once deleting
a post in Buffer became the ordinary way to drop one, it would have waited
forever for a send you had personally cancelled; and a guide, which has no
publication rows at all, needed a special case to escape the same trap. One
date-and-status question replaces all three.

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
`GH_DISPATCH_TOKEN_CONTENT` and `GH_DISPATCH_TOKEN_WEBSITE` — the PATs that let `/generate`, `/publish-now` and
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
- **No opt-in surface states a send frequency**, because `pnpm run newsletter` has
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
- Nothing emails performance numbers on a schedule any more. `pnpm run mkt:report`
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
   `CODEX_AUTH` for the unattended GitHub Codex worker. `BUFFER_API_KEY` is now
   needed by **both** `marketing-weekly-batch.yml` (which ends by pushing the
   week into Buffer) and `marketing-publish.yml` (which reads it back) — the
   batch job never needed it before.
3. `ADMIN_PASSWORD` on `admin-review` only keeps the leftover `admin.theplot.tv`
   bookmark from answering 503. Review does not happen there. Leave the secret
   until that host is removed (`docs/ops/retire-admin-review.md`).
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
