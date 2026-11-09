# Plot marketing automation

The inventory of every automation (what starts it, which secrets it uses, where
the content lands) is [`docs/ops/gtm-automations.md`](../docs/ops/gtm-automations.md).
This file is the operator manual for the weekly flow.

Every post has two halves, and they are reviewed in different places.

1. GitHub prepares the week.
2. The social copy is pushed into **Buffer** as dated **drafts**. You review,
   edit and approve them there; Buffer sends what you approve. Nothing goes out
   on its own.
3. The website article is reviewed in **Notion**, on What's On Articles.
   Status Review is a draft. Scheduled approves it. Canceled
   keeps it off theplot.tv.

**Neither half gates the other.** A rejected article does not pull its posts out
of Buffer, and a failed send does not take the article off the site. This is
deliberate: each surface controls what it can actually show you, and nothing
claims a power it does not have.

The split is the point. Buffer has the character counter, the preview and the
calendar, so it is where a caption should be judged. It has no idea the article
exists. Notion holds the article. It cannot show you how a post will look.

Articles are reviewed in Notion. The board is What's On Articles
(`https://app.notion.com/p/3f04f244aec781baaffbc1523b57ecb4`). The sweep is
`marketing-notion-mirror` (`docs/ops/gtm-automations.md` section 5a and
`marketing/REVIEW.md`). Production has `MARKETING_LINEAR_ENABLED` set to `off`,
so new article cards are not filed in Linear. Social posts are reviewed in
Buffer. The hosted desk at `admin.theplot.tv` is retired: see
`docs/ops/retire-admin-review.md`. The database is what Notion and Buffer write.

The voice and spec rules in `VOICE.md` and `copy/AGENT.md` are maintained by
hand. An automated Sunday learning loop used to rewrite them from the previous
week's shipped copy. That loop is gone: no workflow, no admin control, no
`learn:*` command. What still governs tone is `VOICE.md`,
`copy/WHATSON_GUIDELINES.md`, and `supabase/functions/_shared/articleRules.js`.
A replacement eval loop is planned and not built. A rule changes only when
someone edits those files.

The production worker is the **Grok CLI** on this Mac. `marketing-weekly-batch.yml`
runs on the self-hosted runner `plot-mac` and passes `--copy-runner=grok` when
`grok` is on `PATH`. The job uses the login already stored for this user and
does not set an API key. If `grok` is missing, that run installs Claude and
passes `--copy-runner=claude`. A local `pnpm run weekly` uses Grok when `grok`
is on `PATH`, and Codex otherwise. Codex and Claude remain available for a
manual run.

## Primary flow

```text
Monday 5:30am Sydney
  -> marketing-weekly-batch.yml generates the next week
     (cron 30 18 * * 0: 5:30am Monday Sydney during daylight time,
     4:30am during standard time, then the job waits until 5:30.
     This Mac also starts the workflow at 5:30am, because GitHub
     often starts the cron late.)
  -> and pushes as much of it into Buffer as the queue will hold.
     Each post is 9:00am America/New_York. 5:30am Monday Sydney is
     Sunday afternoon in the US, so the week runs Monday through
     Sunday Eastern. Buffer then uses that channel's hour on that ET day.

Sunday evening Eastern
  -> marketing-trending-snapshot.yml writes this week's chart
     (cron 22:30 UTC Sunday: 6:30pm ET during daylight time,
     5:30pm ET during standard time)
  -> the Monday trending post and the chart page both read that row

Every 5 minutes (pg_cron -> marketing-notion-mirror)
  -> creates or updates one private Notion page per website article
  -> applies status, date and slash-command comments to marketing_posts

Any time, in Buffer
  -> edit, reschedule or delete social posts

Daily, before 9:00am ET
  -> marketing-publish.yml asks Buffer what happened and writes it down,
     then tops the queue back up with the next posts due
     (cron 02:00 UTC; this repo's scheduler starts it hours later,
     still before 9:00am ET)
```

Nothing sends any more. Buffer sends. The daily run exists to find out what it
did — Buffer has no webhook, so a post that went out, failed, was rewritten or
was deleted reaches the database only because that run goes and asks.

## Operator surfaces

- **Articles:** Notion, What's On Articles
  (`https://app.notion.com/p/3f04f244aec781baaffbc1523b57ecb4`).
  Database id `3f04f244-aec7-81ba-affb-c1523b57ecb4`. Status Review is a draft.
  Linear article cards are off.
- **Social posts:** Buffer (`https://publish.buffer.com`)
- **Primary automation layer:** GitHub Actions
- **Primary copy worker:** Grok CLI on this Mac. Claude only if `grok` is not on PATH. Codex remains available for a manual run.
- **Fallback/debug only:** local commands from `marketing/`
- The old `admin.theplot.tv` desk is retired: `docs/ops/retire-admin-review.md`

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
- A local `pnpm run weekly` uses Grok when `grok` is on PATH, otherwise Codex.
  Pass `--copy-runner=claude` or `--copy-runner=codex` to force one. Production
  on this Mac uses the same Grok default.
- `--copy-command='...'` is still available for fallback/debug use.

## Review and publish

- Weekly generation renders posts with status `needs_review`, then pushes their
  social copy into Buffer as **drafts**, **on the post's own day, at a time
  Buffer chose**. It pushes as many as the queue will hold; the daily run tops
  it up from there (see below).
- A draft sends only once you approve it in Buffer. The copy is written by a
  model with live web access, so the gate is opt-in on purpose: a post nobody
  has read never goes out. `BUFFER_PUSH_AS_DRAFT=0` pushes queued posts
  instead, for a run that was reviewed some other way.

### Who decides when a post goes out

**The day is ours. The time is Buffer's.**

The day has to be ours, because the copy is written against it and says so out
loud — "14 days until", "aired last night", "turns 15 this week". A post that
slides to the next day starts lying about itself, which is why `validateCopy`
checks day claims in the first place.

The time is Buffer's because Buffer is better placed to judge it. Each channel
carries a posting schedule: the hours Buffer recommends for that service on that
weekday. Those hours are applied as Eastern Time on the post's ET day. Any
timezone Buffer reports on the channel is ignored. The nth post for a channel
on a day takes the nth slot.

Edit those schedules in Buffer and the next push follows them. Nothing here
needs changing. The hours move with whatever Buffer currently recommends.

**Why not just use Buffer's queue?** Because `addToQueue` lets *queue order*
decide the date. Threads has 14 slots a week against roughly 16 posts, so posts
would quietly land on days their own text contradicts. Pinning the day and
borrowing the hour keeps both judgements where they belong.

When a day has more posts than slots, the extras are spaced 45 minutes after the
last one rather than stacked on it. Two posts on the same minute read as a bot,
and Instagram may drop the second. A channel with no schedule for that weekday
falls back to 9:00am ET (`SEND_HOUR_ET` in `publish/payload.mjs`).

The daily GitHub job does not choose that hour. Buffer does, and Buffer sends
at the Eastern Time it was given. GitHub's scheduler on this repo starts crons
hours after the line in the file. That lag only delays the reconcile and the
queue top-up. A 5.5 hour lag on the 02:00 UTC job is about 3:30am ET, still
before the 9:00am ET slot the planner stores.
- Within five minutes the mirror sweep opens a Notion page for each post's
  article, in **Review**.
- **Leaving a card untouched means the article does not go live.** The social
  posts are separate: they sit in Buffer as drafts and go out only once you
  approve them there. Silence stops both, each in its own place.
- **The database is the source of truth about what happened**, not about what
  will happen. Buffer holds the queue; the daily reconcile run reads it back into
  `marketing_post_publications`.

### The queue is a rolling window, not a week

The Buffer plan caps **10 scheduled posts per channel**, and a week of Plot is
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
limit looks after itself, but the rules a counter cannot see — no URLs on X except the required YouTube link on trailer-related posts, no
"this Friday" on a post that runs a fortnight out — are yours to hold. That is
the same trade the web desk already makes, and the reason a `/copy` comment in
Notion is validated and a Buffer edit is not.

The reconcile run notices an edit and records the text that actually went out, so
`sent_text` stays true even when it no longer matches the copy we generated.

### Reviewing articles in Notion

The marketing Notion mirror creates one page for each website article. Review
Status and Scheduled date there, or use `/copy`, `/approve`, `/reject`, and
other commands in comments. Social-only questions have no article page.
See `marketing/REVIEW.md` for the full review procedure. Social captions stay
in Buffer. The weekly website-refresh card was retired separately in #1306.

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

Days are US Eastern weekdays. Posts are stored at 9:00am ET unless a type has
an entry in `PUBLISH_TIME_BY_TYPE`.

- Monday: `trending` (the chart)
- Tuesday: `upcoming`, then the mid question. If the slate is empty, the fill mix, which still places the mid question
- Wednesday fixed feature: `watch_tonight`, then the fill mix
- Thursday: a new trailer, otherwise a countdown (T-1, then T-7, then T-14), then the mid question. If that chain has no candidate, the fill mix, which still places the mid question
- Friday: `now_streaming` (a title new at home that day). If none, the fill mix
- Saturday fixed feature: `hidden_gem`, then the fill mix
- Sunday: the lead question, then `on_this_day`. If the anniversary has no candidate, the fill mix

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

- The reviewed weekly letter follows [the newsletter editorial rules](newsletter/THE-WEEK.md), including source variety, artwork, box-office context, and Substack metadata.
- Newsletter sends are logged as weekly issue snapshots in
  `marketing_newsletter_issues`. That log is internal only — the table is
  service-role and nothing serves it.
- **There is no public archive.** The digest lives in the inbox it was sent to.
  On the site the newsletter is just a signup form, at the foot of What's On
  under `#newsletter` (the homepage has its own form; neither the nav nor the
  footer links to it). `theplot.tv/newsletter`
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
- The trending snapshot runs every Sunday evening Eastern
  (`.github/workflows/marketing-trending-snapshot.yml`, cron `30 22 * * 0`:
  6:30pm ET during daylight time, 5:30pm ET during standard time). The row is
  dated that Sunday. `pnpm run snapshot` writes the same Sunday row by hand.
  If Monday's post is planned before the row exists, the planner fetches live
  and writes it. The chart page does not state a clock time.
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

The copy contract is model-agnostic. The production runner is the Grok CLI on
this Mac. A local run uses Grok when `grok` is on PATH, and Codex otherwise:

- `marketing/copy/pull.mjs` writes one brief per pending post
- the worker writes one `<post_id>.copy.json` response per brief
- `marketing/copy/save.mjs` validates the output and persists both:
  - `copy`
  - `generated_copy`

Copy that names a day the post's own schedule contradicts is rejected: a
countdown 14 days out cannot say "this Friday". `validateCopy` takes the post's
`days_until` / `when_label` and checks the claim against them, so the rule holds
whether the copy came from the worker or from a `/copy` comment in Notion.

The validation boundary is `supabase/functions/_shared/copySchema.js`, re-exported
as `marketing/copy/schema.mjs` for the Node pipeline. It lives in the functions
tree because both runtimes now enforce it: `copy/save.mjs` on the worker's output,
and `marketing-notion-sync` on copy edited from a Notion comment.

## Setup

1. Apply the Supabase migrations and deploy the functions.
2. Set secrets for Supabase, TMDB, OMDb, Buffer, Resend, and the admin email.
   `BUFFER_API_KEY` is needed by both `marketing-weekly-batch.yml` (which ends
   by pushing the week into Buffer) and `marketing-publish.yml` (which reads it
   back). The weekly job does not set an API key for Grok.
   `CLAUDE_CODE_OAUTH_TOKEN` is used only when `grok` is missing.
3. The admin desk is gone. Do not set `ADMIN_PASSWORD` / `ADMIN_TOKEN` for a
   review UI. See `docs/ops/retire-admin-review.md` if an old secret is still
   hanging around to unset.
4. The weekly job uses the Grok CLI already signed in on this Mac (`~/.grok`).
   Claude is installed on the runner only for a week where `grok` is not on PATH.
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
