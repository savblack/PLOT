# GTM automations

Living inventory of every go-to-market, content, and social automation in this
repo. Written for the product owner. The operator manual for the weekly flow
is still [`marketing/README.md`](../../marketing/README.md). This file is the
map: what runs, what starts it, where the words and pictures come from, and
where they land.

Last reviewed against the tree on October 12, 2026. If a workflow, script, or
edge function named below disappears or changes trigger, update this file in
the same change.

There is no Inngest, Trigger.dev, Temporal, or third-party CMS. Articles are
rows in Supabase (`marketing_posts`), rendered by the `marketing-feed` edge
function, and proxied onto theplot.tv. Social posts are scheduled in Buffer.
Copy is written by a CLI model worker (Claude Code in CI).

**Changelog posts: not found.** Nothing in workflows, scripts, edge functions,
or docs plans a product changelog, release-notes feed, or "what's new" post.
The only "changelog" mentions are Dependabot's instruction to read a dependency
changelog, and a research note about Expo. Confirm whether a changelog lives
outside the repo (Linear, a doc, a manual Buffer post).

---

## How a normal week works

1. Saturday evening Eastern, GitHub Actions plans the coming week, asks Claude to write
   the copy, renders social cards, and pushes as many posts as Buffer will hold.
   Each post is dated for its Eastern Time day. The planner stores 9:00am ET.
   Buffer then uses that channel's hour on that ET day. A rejected copy file
   does not skip that render. If a card is still missing, the daily job renders
   it again before the top-up, and will not queue the post on a raw TMDB still.
   Sunday evening Eastern, a separate job writes the trending snapshot the
   Monday chart reads.
2. Within about five minutes, a database job opens one Linear card per website
   article (team PLO, project Content Automation).
3. You edit or delete the social captions in Buffer. Buffer sends them on the
   day the planner chose, at an hour Buffer's own schedule picked.
4. You approve or reject the article in Linear. That
   decision is about theplot.tv only. It does not pull a post out of Buffer.
5. On the article's day, if it was approved, it appears on
   [theplot.tv/whats-on](https://theplot.tv/whats-on).
6. Once a day, GitHub asks Buffer what actually happened, writes that back to
   the database, and fills any Buffer slots the day's sends freed.

The two halves do not gate each other. That is deliberate. See
[`marketing/README.md`](../../marketing/README.md).

---

## 1. Weekly content batch

**What it is.** The production content factory. Plans posts, writes copy,
renders images, and starts the Buffer queue.

**Trigger.** GitHub Actions schedule, plus manual "Run workflow", plus the
Linear comment `/generate` (which dispatches this same workflow).

**Schedule.** Cron `30 0 * * 0` in [`.github/workflows/marketing-weekly-batch.yml`](../../.github/workflows/marketing-weekly-batch.yml).
That is 00:30 UTC Sunday, Saturday evening Eastern, and still before 9:00am ET
Sunday even when GitHub starts the job hours late (measured on the daily job;
see section 3). Treat the cron line as the request. The week is planned before
the first 9:00am ET post.

**Entrypoints.**

- [`.github/workflows/marketing-weekly-batch.yml`](../../.github/workflows/marketing-weekly-batch.yml)
- [`marketing/scripts/automation.mjs`](../../marketing/scripts/automation.mjs) command `weekly`
- Then, in order: [`marketing/planner/plan.mjs`](../../marketing/planner/plan.mjs),
  [`marketing/planner/guides.mjs`](../../marketing/planner/guides.mjs),
  [`marketing/copy/pull.mjs`](../../marketing/copy/pull.mjs),
  the Claude CLI (isolated copy of the briefs),
  [`marketing/copy/save.mjs`](../../marketing/copy/save.mjs),
  [`marketing/generate/generate.mjs`](../../marketing/generate/generate.mjs),
  [`marketing/publish/schedule.mjs`](../../marketing/publish/schedule.mjs)

**Secrets (names only).** `CLAUDE_CODE_OAUTH_TOKEN`, `VITE_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `TMDB_API_KEY`, `OMDB_API_KEY`, `RESEND_API_KEY`,
`MARKETING_ADMIN_EMAIL`, `BUFFER_API_KEY`. The copy worker itself is given a
stripped environment (no database or Buffer key). See
[`marketing/lib/cli-runner.mjs`](../../marketing/lib/cli-runner.mjs).

**Outputs.**

- Rows in `marketing_posts` (status `needs_review` when render succeeds, `failed` when it does not) and `marketing_post_publications`.
- JPEG cards in the public Supabase Storage bucket `marketing`.
- A private HTML week sheet used to be uploaded to bucket `marketing-review`
  (`week.html`). That upload stopped; build a local sheet with
  `marketing/preview/week.mjs` if you need one.
- An email to `MARKETING_ADMIN_EMAIL`: "N posts ready to review".
- A `marketing_batch_runs` row with `run_type = 'generate'`.
- Buffer scheduled posts, as many as each channel's cap allows.

**Dependencies.** Claude Code CLI pinned to `@anthropic-ai/claude-code@2.1.226`,
Playwright Chromium, TMDB, OMDb, Wikipedia (research pack), Supabase, Buffer,
Resend.

**How it works.**

1. The planner looks at the next seven days and inserts post rows that do not already exist. The day decides the type (see Cadence below). Thin days simply get fewer posts.
2. A second planner adds up to four web-only SEO guides ("best of" and "if you liked"). Those never go to social.
3. Each post that still needs words gets a markdown brief under `marketing/copy/jobs/`.
4. Claude reads [`marketing/copy/AGENT.md`](../../marketing/copy/AGENT.md) and each brief, searches the web for the article, and writes one JSON file per post. It runs in a temp folder so it cannot see `.env`.
5. `save.mjs` checks the JSON against the copy contract. Bad copy is rejected and that post stays `planned`. Good copy is stored as both `copy` (what we will use) and `generated_copy` (what the model first wrote), and the row moves to `copy_ready`. A rejection does not stop the rest of the week. The workflow still fails at the end so the rejected files are visible. On 4 October 2026 this exit used to happen *before* rendering, which is why a week reached `copy_ready` with `media` null.
6. Playwright screenshots the HTML card templates into portrait (1080x1350) and landscape JPEGs and uploads them to `marketing/<post id>/card-0-portrait.jpg` and `card-0-landscape.jpg`. The website hero is a plain TMDB still, not the branded card. Trending charts are the exception: the branded chart is the hero. `question` posts stay text-only. `guide` posts get no social card.
7. The script emails you with links to Linear and Buffer when something new needs article review.
8. It then pushes social copy into Buffer for posts whose cards exist. It does not wait for you to approve the article. It does not attach a TMDB still when the card is missing. Those rows stay `queued` and the daily job renders them again.

Local equivalent: `pnpm run mkt:plan` through `mkt:generate` and `mkt:schedule`, or from `marketing/`: `pnpm run weekly`. Local runs default to Codex, not Claude. Pass `--copy-runner=claude` to match CI.

---

## 2. Buffer scheduling

**What it is.** The only thing that puts posts on X, Instagram, and Threads.
Nothing in this repo sends social posts itself anymore.

**Trigger.** End of the weekly batch, and again at the end of the daily reconcile (section 3) to top the queue up. Also `workflow_dispatch` input `retry_failed` on the daily workflow, and `pnpm run mkt:schedule`.

**Schedule.** No cron of its own. It rides the weekly and daily workflows.

**Entrypoints.** [`marketing/publish/schedule.mjs`](../../marketing/publish/schedule.mjs), [`marketing/publish/buffer.mjs`](../../marketing/publish/buffer.mjs), [`marketing/publish/payload.mjs`](../../marketing/publish/payload.mjs).

**Secrets.** `BUFFER_API_KEY`. Optional overrides `BUFFER_CHANNEL_TWITTER`, `BUFFER_CHANNEL_INSTAGRAM`, `BUFFER_CHANNEL_THREADS` (the code uppercases the Buffer service name). Also `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

**Outputs.** Scheduled (or, on retry, re-queued) posts in Buffer. Publication rows updated with Buffer's post id. `marketing_batch_runs` rows from the schedule script.

**Dependencies.** Buffer GraphQL API (`https://api.buffer.com`). Public image URLs from the `marketing` storage bucket. Instagram needs an image; question posts are text-only and skip Instagram.

**How it works.**

1. The script reads posts in `needs_review` or `approved` that are not yet in Buffer, soonest day first. Article approval is not required. `needs_review` is enough.
2. A post that has a card template and no portrait plus landscape file in `media` is not pushed. The publication stays `queued`, the post's `error` says the cards are missing, and the run fails after the other posts are handled so the miss is mailed. Questions are text-only and are pushed without an image. Guides are not given publication rows by the renderer.
3. If `marketing_settings.publishing_paused` is true, it stops. Posts already in Buffer still go out. `/pause` in Linear sets that flag. It does not empty the queue.
4. The day is fixed by the planner, because the caption talks about that day ("aired last night", "14 days until"). The planner stores 9:00am Eastern. The hour Buffer sends comes from that channel's posting schedule, applied as Eastern Time on the post's ET day. Any timezone Buffer reports is ignored. If a channel has no schedule that weekday, the fallback hour is 9:00am ET (`SEND_HOUR_ET` in `payload.mjs`).
5. Buffer's plan holds about 10 scheduled posts per channel. A week is about 16 per channel, so the push fills a rolling window of roughly four days. The rest stay `queued` in the database until a later run.
6. A full queue is normal. The job reports the leftover count instead of failing. Missing cards are not normal. That count fails the run.

You review, edit, reschedule, and delete in Buffer. Those edits are not checked against the copy contract. The daily reconcile records the text that actually went out in `sent_text`.

---

## 3. Daily Buffer reconcile, top-up, and empty-queue watch

**What it is.** Bookkeeping plus the thing that keeps the queue from running dry. Buffer has no webhook, so this job is how the database learns that a post sent, failed, was rewritten, or was deleted.

**Trigger.** [`.github/workflows/marketing-publish.yml`](../../.github/workflows/marketing-publish.yml). The filename still says "publish". The workflow no longer sends. It is also what you rerun with `retry_failed`.

**Schedule.** Cron `0 2 * * *` (02:00 UTC). GitHub's scheduler on this repo starts the job hours later. A 5.5 hour lag is about 3:30am ET, still before the 9:00am ET slot. Buffer itself is punctual and sends at the Eastern hour it was given. What the drift costs is how fast freed slots get refilled.

**Entrypoints.** [`marketing/publish/reconcile.mjs`](../../marketing/publish/reconcile.mjs), then [`marketing/generate/generate.mjs`](../../marketing/generate/generate.mjs) (retry any card that never rendered), then [`marketing/publish/schedule.mjs`](../../marketing/publish/schedule.mjs), then [`marketing/publish/queue-check.mjs`](../../marketing/publish/queue-check.mjs). Failure mail: [`.github/scripts/marketing-alert.sh`](../../.github/scripts/marketing-alert.sh). `workflow_dispatch` input `render_only` runs just the card retry.

**Secrets.** `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BUFFER_API_KEY`, `TMDB_API_KEY` (the card retry), `RESEND_API_KEY`, `MARKETING_ADMIN_EMAIL`.

**Outputs.** Updated `marketing_post_publications` (status, permalink, `sent_text`). Approved posts whose socials have all gone out move to `published` or `partially_published`. Rejected and unreviewed articles keep their verdict even if the tweets sent. IndexNow is told about newly finished article URLs (not trending charts). A `marketing_batch_runs` row with `run_type = 'reconcile'`. Email if the job fails, or if nothing is queued for the next 3 days.

**Dependencies.** Buffer (read), Playwright Chromium (the card retry), IndexNow (`https://api.indexnow.org/IndexNow`), Resend.

**How it works.**

1. Optional: if you checked "retry failed", push publications that never reached Buffer.
2. For every publication still marked scheduled, ask Buffer for its status and write the answer down.
3. Render cards for any post that has copy and still has no media. An approved article stays approved. A question is left text-only.
4. Push the next queued posts into whatever slots that freed. A card post that still has no image is left `queued` and the job fails.
5. If the next three days have nothing queued, email you. This check lives on the daily job on purpose: when the Sunday batch cannot get a runner (billing), its own failure email cannot run either. The daily job is the watchdog.
6. The watchdog email says /whats-on will go stale. Social posts already sitting in Buffer can still go out. The two problems are different.

Guides have no Buffer rows, so this job never sees them. IndexNow is not called for a guide that only exists as a website article. The article sitemap (`marketing-feed?sitemap=1`, proxied at `/sitemap-articles.xml`) is the other way search engines find pages.

---

## 4. Linear mirror (open and file the article cards)

**What it is.** Keeps the Linear board matched to the database. One card per website article. Question posts (social only, no article) get no card.

**Trigger.** `pg_cron` job `marketing-linear-mirror`, every 5 minutes, calling the edge function over `pg_net`.

**Schedule.** Defined in [`supabase/migrations/20260912090000_schedule_linear_mirror.sql`](../../supabase/migrations/20260912090000_schedule_linear_mirror.sql).

**Entrypoints.** [`supabase/functions/marketing-linear-mirror/index.ts`](../../supabase/functions/marketing-linear-mirror/index.ts). Issue body HTML is built in [`supabase/functions/_shared/linearIssue.js`](../../supabase/functions/_shared/linearIssue.js).

**Secrets (Supabase edge function secrets, not GitHub).** `LINEAR_API_KEY`, Vault secrets `edge_webhook_bearer` and `edge_webhook_base_url` (the cron uses these). Optional: `LINEAR_MARKETING_TEAM_ID`, `LINEAR_MARKETING_PROJECT_ID`, `LINEAR_REVIEW_STATE`, `LINEAR_SCHEDULED_STATE`, `LINEAR_REJECTED_STATE`, `LINEAR_PUBLISHED_STATE`, `GH_REPO`, `GH_DISPATCH_TOKEN_CONTENT`, `GH_DISPATCH_TOKEN_WEBSITE`, `GH_DISPATCH_TOKEN` (legacy fallback), `RESEND_API_KEY`, `MARKETING_ADMIN_EMAIL`, `MARKETING_LINEAR_ENABLED`.

`MARKETING_LINEAR_ENABLED` defaults to on. Set it to `off` (`0`, `false`, or `no` also count) only after the Notion database in section 5a has been used for a real week. Article create, refresh, and column moves stop. The Monday website-refresh PR card still gets filed.

**Outputs.** Linear issues in team PLO, project Content Automation. States, by name: Review, Scheduled, Canceled, Published. A website-refresh card for the Monday timeline PR (section 8), marked urgent. `marketing_batch_runs` rows with `run_type = 'linear_mirror'`. `marketing_posts.linear_sync_error` when a card fails. Once a day (first sweep after 06:00 UTC) it probes the two GitHub tokens and emails if one is dead.

**Dependencies.** Linear API, GitHub API (token probe and the timeline PR card), Resend.

**How it works.**

1. Every five minutes it looks for article posts that need a card, a refresh, or a column move.
2. A new post lands in Review. Approving moves it to Scheduled. When the article's day has arrived and it was cleared, the card moves to Published. Rejected cards go to Canceled.
3. Dragging to Scheduled or Canceled is the same as `/approve` and `/reject`. Dragging to Published does nothing. The sweep decides "live", not the board.
4. It does not talk to Buffer.
5. Idle sweeps are pruned after 24 hours. The newest row is kept, so a dead cron shows up as a stale timestamp rather than an empty table.

Dry run (writes nothing):

```sh
curl -sX POST "$SUPABASE_URL/functions/v1/marketing-linear-mirror" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' -d '{"dry_run": true}'
```

---

## 5. Linear sync (your comments change the database)

**What it is.** The other half of the board. Linear sends a webhook when you comment or drag a card. This function applies it.

**Trigger.** Linear webhook on Comments and Issues, pointed at `<SUPABASE_URL>/functions/v1/marketing-linear-sync`.

**Entrypoints.** [`supabase/functions/marketing-linear-sync/index.ts`](../../supabase/functions/marketing-linear-sync/index.ts), command parser [`supabase/functions/_shared/linearCommands.js`](../../supabase/functions/_shared/linearCommands.js).

**Secrets.** `LINEAR_WEBHOOK_SECRET`, `LINEAR_API_KEY`, `GH_DISPATCH_TOKEN_CONTENT`, `GH_DISPATCH_TOKEN_WEBSITE`, `GH_DISPATCH_TOKEN` (legacy), `GH_REPO`. Gateway JWT check is off because Linear does not send a Supabase JWT. The HMAC is the auth. Pinned in [`supabase/config.toml`](../../supabase/config.toml).

**Outputs.** Updates to `marketing_posts` (status, copy, day). Audit rows in `marketing_review_events` with actor `linear`. A bot reply on the issue. For `/generate`, `/publish-now`, and `/regenerate`, a GitHub workflow dispatch. For `/approve` and `/reject` on a timeline-refresh card, a merge or close of that PR.

**Dependencies.** Linear, GitHub Actions, the copy schema (a `/copy` edit that fails validation is refused and nothing is saved).

**How it works.** Comment on the card. The first line is the command.

| Comment | Effect |
| --- | --- |
| `/approve` | Article may go live on its day. Card moves to Scheduled. |
| `/reject` | Article will not go live. Social posts in Buffer are untouched. |
| `/unapprove` | Back to needs review. |
| `/reschedule YYYY-MM-DD` | Moves the article's day. An unpublished URL moves with it. A live URL stays. |
| `/publish-now` | Approves and brings the article forward to today. |
| `/regenerate` | Throws the copy away so the worker rewrites it. |
| `/copy` then `title:` / `body:` / `cta:` | Edits the article. Social fields are not accepted here. |
| `/pause` and `/resume` | Stops or resumes new posts entering Buffer. Does not empty Buffer. |
| `/generate` | Dispatches the Sunday workflow now. |
| `/help` | The list, in the issue. |

Leaving a card untouched means the article does not go live. It does not stop the social posts.

With `MARKETING_LINEAR_ENABLED` off, a comment on an article card gets a reply that review moved to Notion, and a column drag is ignored with no reply. `/pause`, `/resume`, `/generate`, and `/help` still run. Approve and reject on a website-refresh PR card still run, including the scope check that refuses anything that is not that Monday PR.

The writes live in [`supabase/functions/_shared/reviewActions.js`](../../supabase/functions/_shared/reviewActions.js). Notion calls the same module.

---

## 5a. Notion review (stand this up beside Linear)

**What it is.** A second article board, in Notion, kept in step with `marketing_posts` the way section 4 keeps Linear. One page per article. Linear keeps working until you set `MARKETING_LINEAR_ENABLED` to `off`. That secret is the switch. Merging the migration does not flip it.

**Trigger.** `pg_cron` job `marketing-notion-mirror`, every 5 minutes. An optional Notion webhook on `<SUPABASE_URL>/functions/v1/marketing-notion-sync` wakes the same comparison for one page.

**Schedule.** Defined in [`supabase/migrations/20261005180000_marketing_notion_review.sql`](../../supabase/migrations/20261005180000_marketing_notion_review.sql). The cron can be scheduled before the Notion secrets exist. The function then answers 200 and writes nothing.

**Entrypoints.** [`supabase/functions/marketing-notion-mirror/index.ts`](../../supabase/functions/marketing-notion-mirror/index.ts), [`supabase/functions/marketing-notion-sync/index.ts`](../../supabase/functions/marketing-notion-sync/index.ts). Page body and status mapping live in [`supabase/functions/_shared/notionReview.js`](../../supabase/functions/_shared/notionReview.js). The sweep is [`supabase/functions/_shared/notionMirror.js`](../../supabase/functions/_shared/notionMirror.js). Comments reuse [`linearCommands.js`](../../supabase/functions/_shared/linearCommands.js).

**Why a sweep, not webhooks alone.** Notion's webhook does not include the previous property value. Acting on the current Status would re-apply the sweep's own write, which is how a Linear description refresh once unapproved a card (PLO-421). The sweep stores `notion_observed_status` and `notion_observed_date`. A difference is the decision. Status and the scheduled date are read for every page on every tick, so a missed webhook cannot drop an approval. Slash comments are listed for posts that are not yet live and for posts whose day is within 21 days, because a comment does not bump Notion's `last_edited_time`. Older comments need the webhook, or a page edit in the same window.

**Secrets (Supabase edge function secrets).** `NOTION_TOKEN` (or `NOTION_API_KEY`), `NOTION_MARKETING_DATABASE_ID`. Optional `NOTION_WEBHOOK_SECRET`. `/generate` and `/regenerate` reuse `GH_DISPATCH_TOKEN_CONTENT` or `GH_DISPATCH_TOKEN`, and `GH_REPO`. The cron reuses Vault `edge_webhook_bearer` and `edge_webhook_base_url`.

**Create the database.** [`marketing/setup/notion-review-db.mjs`](../../marketing/setup/notion-review-db.mjs). Parent page comes from `NOTION_PARENT_PAGE_ID`. There is no default in the script. Savannah's Growth page, under 01 · Plot, is `3ed4f244-aec7-818c-8c18-c3f1228a4525`. Share that page with the integration, dry-run, then create:

```sh
DRY_RUN=1 node --env-file=.env marketing/setup/notion-review-db.mjs
node --env-file=.env marketing/setup/notion-review-db.mjs
```

Properties: Name, Status (Review, Scheduled, Canceled, Published), Scheduled, Article URL, Post type, Social copy, Post id. Put the printed id in `NOTION_MARKETING_DATABASE_ID`. Full steps are in [`marketing/REVIEW.md`](../../marketing/REVIEW.md).

**Outputs.** One Notion page per article row that has a slug. `marketing_posts.notion_page_id` and `notion_synced_at`. Audit rows with actor `notion`. `marketing_batch_runs` with `run_type = 'notion_mirror'`. A bot comment on the page when a command needs a reply. The first real sweeps create at most 15 pages each, newest day first.

**What it does not do.** Weekly website-refresh PR cards stay on Linear. Approving does not touch Buffer or `marketing_post_publications`. Social copy on the page is reference text. Edits to the page body or that property are overwritten. The public site still shows `approved`, `published`, and `partially_published` only.

Dry run, after the secrets exist and before you want pages created:

```sh
curl -sX POST "$SUPABASE_URL/functions/v1/marketing-notion-mirror" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' -d '{"dry_run": true}'
```

`would_create` is the number to read.

---

## 6. What's On (the article site)

**What it is.** The public blog. Not a separate CMS and not a cron. It reads the database on each request.

**Trigger.** A browser or crawler hitting theplot.tv.

**Entrypoints.**

- [`apps/website/functions/whats-on.js`](../../apps/website/functions/whats-on.js) and [`apps/website/functions/whats-on/[slug].js`](../../apps/website/functions/whats-on/[slug].js) proxy to the edge function.
- [`apps/website/functions/_lib/whats-on.js`](../../apps/website/functions/_lib/whats-on.js)
- [`supabase/functions/marketing-feed/index.ts`](../../supabase/functions/marketing-feed/index.ts)
- Sitemap proxy: [`apps/website/functions/sitemap-articles.xml.js`](../../apps/website/functions/sitemap-articles.xml.js)
- Chart page data: `marketing_trending_snapshots`, written by section 10.

**Secrets.** `TMDB_API_KEY` inside the edge function (provider names on the page). `verify_jwt = false` in `config.toml`. Forgetting that on redeploy takes /whats-on down at the gateway.

**Outputs.** HTML at `https://theplot.tv/whats-on` and `https://theplot.tv/whats-on/<slug>`. Open Graph images prefer the post's hero still, then the static brand image.

**How it works.**

1. A post is visible when its status is `approved`, `published`, or `partially_published`, and `scheduled_for` is not in the future.
2. Question posts have no slug and never appear.
3. The hero image is `copy.hero_image` (a TMDB still). Trending posts have no still, so they use the branded chart render from storage.
4. Approving early does not publish early. The date on the row is the gate. `/publish-now` is how you pull that date forward.

---

## 7. Backfill a missed range

**What it is.** Emergency filler for days the weekly batch missed (a failed Sunday, an Actions billing block).

**Trigger.** Manual only. [`.github/workflows/marketing-backfill.yml`](../../.github/workflows/marketing-backfill.yml). Local: `pnpm run mkt:backfill`.

**Entrypoint.** [`scripts/seed-marketing-backfill.mjs`](../../scripts/seed-marketing-backfill.mjs).

**Secrets.** `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TMDB_API_KEY`, `OMDB_API_KEY`.

**Outputs.** `marketing_posts` written straight to status `published`. They show on /whats-on immediately and skip Linear review. Copy in this script is hand-written against `VOICE.md`, not generated by Claude.

**How it works.** The workflow defaults to a dry run. You pass a from/to date, read the printed posts, then run again with "Write for real". `--reset` (which deletes every backfill post) is deliberately not exposed on the workflow.

---

## 8. Homepage timeline and trending hero

**What it is.** Keeps the marketing homepage's watch-history timeline and the app-mockup hero on current titles.

**Trigger.** [`.github/workflows/timeline-refresh.yml`](../../.github/workflows/timeline-refresh.yml).

**Schedule.** Cron `0 9 * * 1` (09:00 UTC Monday). Also manual. A second job listens for CircleCI's success status and squash-merges the PR.

**Entrypoint.** [`scripts/refresh-timeline.mjs`](../../scripts/refresh-timeline.mjs).

**Secrets.** `TMDB_API_KEY`. The PR uses the default `GITHUB_TOKEN`. The Linear card (section 4) uses `GH_DISPATCH_TOKEN_WEBSITE`.

**Outputs.** A PR on branch `timeline-refresh/YYYY-MM-DD` touching `apps/website/data/timeline.json`, `apps/website/images`, and `apps/website/index.html`. After merge, Cloudflare Pages deploys theplot.tv. A Linear card appears within about five minutes. It is a record, not a gate: the PR still auto-merges when CI is green, including when a new title has an empty note.

**Dependencies.** TMDB trending API, CircleCI (the merge waits on `ci/circleci: check`), Linear (display only).

**How it works.**

1. The script appends at most one newly trending title per week, and only if it clears a high bar (250 votes, score 7.0). Most weeks it adds nothing.
2. Poster URLs point at TMDB's image CDN. Paths are refreshed so they stay valid. Artwork is not stored as files for the timeline itself. The workflow still commits `apps/website/images` if the script changes anything there.
3. Hand-written notes are kept. New titles land with an empty note. The PR body lists those titles. Notes are a person's job, but the merge does not wait for them.
4. `/approve` on the Linear card merges a refresh that CI left open. `/reject` closes it. Both re-check that the PR is a bot-authored `timeline-refresh/` branch.

This is the automated homepage image workflow. The static share cards in section 14 are separate and are not on a schedule.

---

## 9. Newsletter digest

**What it is.** A designed HTML email: featured title, the rest of the chart, weekend watch, new on streaming. Each title links to its public page and to a "save in Plot" deep link.

**Trigger.** Manual only. There is no cron. `pnpm run mkt:newsletter` or, from `marketing/`, `pnpm run newsletter`.

**Entrypoint.** [`marketing/newsletter/send-digest.mjs`](../../marketing/newsletter/send-digest.mjs).

**Secrets.** `SUPABASE_URL` or `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY`, `TMDB_API_KEY`, `OMDB_API_KEY`, `RESEND_API_KEY`. `DRY_RUN=1` builds the HTML and sends nothing.

**Outputs.** Email via Resend (`FROM_MARKETING` in [`marketing/lib/email.mjs`](../../marketing/lib/email.mjs)). A row in `marketing_newsletter_issues` (service-role only, not a public archive). Recipients come from the `marketing_recipient_list()` RPC, which resolves the current address from `auth.users`.

**Dependencies.** Resend, TMDB, OMDb, the trending snapshot table.

**How it works.** You run it when you want an issue. Because nothing schedules it, no signup form promises a send frequency. The old `/newsletter` and `/newsletter/<date>` URLs redirect to `/whats-on#newsletter`.

Signup itself is section 12.

---

## 10. Trending chart snapshot

**What it is.** Writes this week's TMDB trending top 20 into `marketing_trending_snapshots` so the chart page, the Monday social carousel, and the newsletter can show ranks and week-over-week movement.

**Trigger.** GitHub Actions, every Sunday evening Eastern: [`.github/workflows/marketing-trending-snapshot.yml`](../../.github/workflows/marketing-trending-snapshot.yml), cron `30 22 * * 0` (22:30 UTC Sunday). That is 6:30pm ET during daylight time and 5:30pm ET during standard time, before Monday's 9:00am ET chart post. Manual: `pnpm run mkt:snapshot`. Also, as a fallback inside the Monday planner ([`marketing/planner/triggers/trending-chart.mjs`](../../marketing/planner/triggers/trending-chart.mjs)): if the latest snapshot is missing or older than the Sunday before that Monday, the planner fetches live and writes the same Sunday row so the Monday post is not empty.

**Entrypoint.** [`marketing/snapshot/write-snapshot.mjs`](../../marketing/snapshot/write-snapshot.mjs).

**Secrets.** `SUPABASE_URL` or `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TMDB_API_KEY`.

**Outputs.** One upserted row per week, dated the most recent Sunday in Eastern Time. A run that starts after midnight ET still writes that Sunday, not Monday. The page shows 20. Social and the newsletter use the top 10. Re-running the same Sunday replaces the row.

**How it works.** It fetches TMDB trending, refuses to write a short list, and upserts. It does not create a social post. The Monday post is a separate planner step that reads this table. The topic key is `trending:<Monday>` and the label is `Week of October 19`.

---

## 11. Brevo contact sync

**What it is.** Two layers. A one-shot (and re-runnable) import of existing users, and live edge functions that keep new signups and profile changes in Brevo.

**Triggers.**

- Manual workflow [`.github/workflows/brevo-sync.yml`](../../.github/workflows/brevo-sync.yml), or `node marketing/setup/brevo-sync.mjs`.
- Database webhook on new `auth.users` rows: [`supabase/functions/notify-signup/index.ts`](../../supabase/functions/notify-signup/index.ts). Also emails `SIGNUP_NOTIFY_TO_EMAIL` through Resend. No hardcoded fallback: unset means no signup email.
- Database webhook on `profiles` insert/update: [`supabase/functions/profiles-changed/index.ts`](../../supabase/functions/profiles-changed/index.ts).

**Secrets.** `BREVO_API_KEY`, `SUPABASE_URL` / `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Edge secrets: `BREVO_LIST_ID` (app users), `BREVO_MARKETING_LIST_ID`, `BREVO_WAITLIST_LIST_ID`, `SIGNUP_NOTIFY_TO_EMAIL`, `RESEND_API_KEY`. GitHub secret `BREVO_API_KEY` is what makes the manual workflow button work.

**Outputs.** Brevo contacts, lists, and attributes (including `WAITLIST_SOURCE`). A Resend email per new signup when `SIGNUP_NOTIFY_TO_EMAIL` is set.

**How it works.** Run the script with `DRY_RUN=1` first. It still creates lists and attributes in the live Brevo account even on a dry run. Copy the three list ids it prints into the edge secrets. Brevo silently drops attribute keys it does not know, so the attribute has to exist before waitlist sync can record a source.

---

## 12. Newsletter and waitlist signup

**What it is.** The public form on theplot.tv, plus unsubscribe links, plus the in-app marketing opt-in.

**Trigger.** Someone submits the form, clicks unsubscribe, or toggles marketing email in the app.

**Entrypoints.**

- [`apps/website/functions/api/newsletter.js`](../../apps/website/functions/api/newsletter.js) proxies to the edge function.
- [`supabase/functions/newsletter-subscribe/index.ts`](../../supabase/functions/newsletter-subscribe/index.ts)
- In-app opt-in writes `profiles.marketing_emails`. A database trigger mirrors that onto the sending list (described in `marketing/README.md`).

**Secrets.** Optional `BREVO_API_KEY`, `BREVO_MARKETING_LIST_ID`, `BREVO_WAITLIST_LIST_ID`. `list: 'mobile-app'` routes to the waitlist. Anything else is the newsletter. The function always returns ok, so it does not reveal whether an address exists.

**Outputs.** Rows in `marketing_subscribers` (or the waitlist table for the app list). Best-effort Brevo upsert. Unsubscribe confirmation page.

---

## 13. Performance report (manual)

**What it is.** An email of last week's template stats, subscriber counts, and the top post by views.

**Trigger.** Manual. `pnpm run mkt:report`. No schedule. The README says nothing emails performance numbers on a cron anymore.

**Entrypoint.** [`marketing/metrics/report.mjs`](../../marketing/metrics/report.mjs).

**Secrets.** Supabase service role, `RESEND_API_KEY`, `MARKETING_ADMIN_EMAIL`.

**Outputs.** One email to the admin address.

**Dependencies.** Tables `marketing_template_stats`, `marketing_posts`, `marketing_metrics`, `marketing_subscribers`. The Meta token/insights pipeline that used to fill Instagram and Threads metrics was removed. IG, Threads, and X are copy-diff only. If `marketing_metrics` is empty, this email will say so with dashes rather than real reach. Confirm that is still the intended state.

---

## 14. Image helpers that are not on a schedule

These exist, and they are easy to mistake for the homepage automation.

| Script | What it does | When it runs |
| --- | --- | --- |
| [`marketing/lib/render.mjs`](../../marketing/lib/render.mjs) plus [`marketing/templates/`](../../marketing/templates/) | Screenshots social cards (1080×1350 and 1600×900) during the weekly batch | Every Sunday batch |
| [`marketing/lib/images.mjs`](../../marketing/lib/images.mjs) | Picks the plain TMDB still used as the article hero | Same batch |
| [`marketing/assets/render-png.mjs`](../../marketing/assets/render-png.mjs) | Rasterises Instagram profile SVGs to PNG | By hand |
| [`marketing/assets/render-cover.mjs`](../../marketing/assets/render-cover.mjs) | Rasterises X header SVGs to PNG | By hand |
| [`scripts/generate-og-image.mjs`](../../scripts/generate-og-image.mjs) | Builds `apps/website/og-image.png` (1200×630 share card) | By hand |
| [`scripts/generate-app-og-image.mjs`](../../scripts/generate-app-og-image.mjs) | Rasterises the app share card to `apps/web/public/og-image.png` | By hand |

The weekly homepage refresh is section 8, not these.

---

## 15. Manual fallbacks and one-off copy repairs

Not production. Useful when the batch is down or a wording rule changes after posts were written.

| Path | Role |
| --- | --- |
| [`marketing/manual/`](../../marketing/manual/) | Build, schedule, and publish one day by hand. See [`marketing/manual/README.md`](../../marketing/manual/README.md). Artifacts land in `marketing/plot-posts/<date>`. |
| [`marketing/preview/`](../../marketing/preview/) | Debug preview of the week sheet. Output in `marketing/preview/out`. |
| [`marketing/copy/sweep-closer.mjs`](../../marketing/copy/sweep-closer.mjs) | One-off. Strips a retired closer ("no wrong answers") from drafts not yet approved. Dry run is the default. |
| [`marketing/copy/rewrite-published.mjs`](../../marketing/copy/rewrite-published.mjs) | One-off. Pulls briefs for already-live articles that still read like a TMDB dump, then applies `<id>.rewrite.json` back onto live rows. |
| [`marketing/REVIEW.md`](../../marketing/REVIEW.md) | Runbook for an agent sitting with you and editing the week through the database. The review-ready email mentions a `/marketing-week` command. That skill file is not in this repo. The runbook is the thing that is. |

---

## 16. Removed: the Sunday learning loop

The loop is not running. Nothing in CI or the copy worker rewrites the voice from last week's posts.

What was removed:

- `marketing/learning/*`
- GitHub workflow `marketing-learning-prep.yml`
- three `learn:*` commands
- a launchd job that was supposed to apply the result on a Mac
- table `marketing_learning_runs`, dropped in [`supabase/migrations/20260813120000_remove_marketing_learning_loop.sql`](../../supabase/migrations/20260813120000_remove_marketing_learning_loop.sql)
- the admin-desk health chip labelled "Learning prep". It only asked GitHub for
  runs of the missing workflow. The desk itself is retired
  ([`docs/ops/retire-admin-review.md`](retire-admin-review.md)).

Production held seven learning rows, every one status `prepared` with an empty summary. The local apply step never ran. No week was ever folded back into `VOICE.md`.

What still governs tone, and is edited by hand:

- [`marketing/VOICE.md`](../../marketing/VOICE.md), injected into every brief
- [`marketing/copy/WHATSON_GUIDELINES.md`](../../marketing/copy/WHATSON_GUIDELINES.md) and [`marketing/copy/AGENT.md`](../../marketing/copy/AGENT.md)
- [`supabase/functions/_shared/articleRules.js`](../../supabase/functions/_shared/articleRules.js), the regex gate on articles and captions

`generated_copy`, `sent_text`, and `sent_payload` stay as a record of what was written and what Buffer sent. Nothing reads them to update the voice.

A new eval and tone loop is planned and not built. The notes under "Tone and an eval loop" below are a wishlist, not a system you can run.

---

## Cadence (what the planner tries to make)

From [`marketing/planner/cadence.mjs`](../../marketing/planner/cadence.mjs) and [`marketing/planner/plan.mjs`](../../marketing/planner/plan.mjs). Days are named in the planner's timezone logic. A day with nothing that qualifies is left thin rather than filled with a guess.

| Day | Fixed slot | Also considered |
| --- | --- | --- |
| Monday | `trending` | The chart. Snapshot from section 10, dated the Sunday before. |
| Tuesday | `upcoming` (weekly slate) | Then the mid question only. The rest of the mix waits unless the slate is empty. |
| Wednesday | `watch_tonight` | Anniversary, then fill |
| Thursday | Trailer, else a countdown | T-1, then T-7, then T-14, then the mid question. If none of those has a candidate, the fill mix, which still places the mid question. |
| Friday | `now_streaming` | A title new at home that day. If none, the fill mix. |
| Saturday | `hidden_gem` | Vote count has a floor and a ceiling so household names do not slip through. See `marketing/README.md`. |
| Sunday | Lead question, then `on_this_day` | If the anniversary has no candidate, the fill mix. |

Question posts are about a title that is already out. They are text-only, X and Threads, no article, no Linear card. If nothing released qualifies, the slot stays empty.

Guides (`post_type = guide`) are extra, web-only, and not on this calendar. About four new evergreen topics per weekly run, skipped when that topic already exists.

Post types and their card templates live in [`marketing/lib/post-types.mjs`](../../marketing/lib/post-types.mjs): `upcoming`, `trending`, `countdown`, `now_streaming`, `trailer`, `on_this_day`, `watch_tonight`, `hidden_gem`. `question` and `guide` have no template.

---

## Where tone, prompts, and templates live

There is no eval harness and no prompt registry. The Sunday learning loop that used to rewrite these files is gone (section 16). A replacement eval loop is planned and not built. Tone is a set of files a person edits. The model is told to follow them. A validator then rejects a list of known failure shapes.

| Path | What it governs |
| --- | --- |
| [`marketing/VOICE.md`](../../marketing/VOICE.md) | The voice. Injected into every brief. Warm, specific, sentence case, US audience (US dates, US streaming services, American spelling), where-to-watch rules, per-network limits, question-post rules. Hand-maintained. |
| [`marketing/copy/AGENT.md`](../../marketing/copy/AGENT.md) | The worker contract: which JSON fields to write, what the validator will reject, which runner CI uses. |
| [`marketing/copy/WHATSON_GUIDELINES.md`](../../marketing/copy/WHATSON_GUIDELINES.md) | How the website article should be sourced and structured, by post type. |
| [`marketing/copy/brief.mjs`](../../marketing/copy/brief.mjs) | Turns one database row plus `VOICE.md` into the markdown brief the model sees. |
| [`marketing/copy/enrich.mjs`](../../marketing/copy/enrich.mjs) | Research pack: TMDB, Wikipedia, OMDb ratings, starting URLs. The model may browse further for the article. Social copy is supposed to stay inside the brief's facts. |
| [`marketing/copy/schema.mjs`](../../marketing/copy/schema.mjs) | Re-export of the shared validator. |
| [`supabase/functions/_shared/copySchema.js`](../../supabase/functions/_shared/copySchema.js) | Field types and lengths. Used when saving model output and when applying a Linear `/copy`. |
| [`supabase/functions/_shared/articleRules.js`](../../supabase/functions/_shared/articleRules.js) | Regex rejects: em and en dashes, long quotations, "critics say" narration, British spelling in social and article copy (legal docs are exempt), audience scores, calling a rental "streaming", trivia asides, a ratings sentence as the closer, and a missing where-to-watch on streaming-type posts. |
| [`marketing/templates/*.html`](../../marketing/templates/) plus `base.css` and `_helpers.js` | The look of the social cards, not the words. |
| [`marketing/tests/`](../../marketing/tests/) | Unit tests for the validator, planner, Buffer payload, Linear commands, and IndexNow. These are regression checks, not scored tone evals. |

The production prompt the CLI actually receives is short and lives in `codexPrompt` inside [`marketing/scripts/automation.mjs`](../../marketing/scripts/automation.mjs): read `AGENT.md`, write one JSON per brief, touch nothing else. The real tone instructions are inside the brief, which embeds `VOICE.md`.

CI installs Claude and passes `--copy-runner=claude`. A local `pnpm run weekly` uses Codex if the `codex` binary is on the machine. The two runners can drift in tone even when the files match.

---

## Observability today

What you can already see:

- **GitHub Actions** run history for the weekly batch, the daily reconcile, backfill, Brevo sync, and the timeline PR. Each marketing workflow emails `MARKETING_ADMIN_EMAIL` via Resend on failure, with a link to the run. The empty-queue warning is a separate email from a healthy daily run.
- **`marketing_batch_runs`.** `generate`, `reconcile`, `linear_mirror`, and `notion_mirror` (including `idle`). These are the heartbeats for the five-minute sweeps. Query in `marketing/README.md`.
- **`marketing_review_events`.** Approve, reject, edit, reschedule, with actor `web_desk`, `marketing_week_skill`, `linear`, or `notion`.
- **`marketing_posts.error`, `linear_sync_error`, and `notion_sync_error`.** Per-post failure text.
- **`sent_text` / `sent_payload` / `generated_copy`.** What the model wrote versus what Buffer sent. Nothing alerts on the diff.
- **Linear** is still the place a person looks for articles until `MARKETING_LINEAR_ENABLED` is off. **Notion** is the board being stood up beside it (section 5a). The daily token probe emails you if `GH_DISPATCH_TOKEN_CONTENT` or `GH_DISPATCH_TOKEN_WEBSITE` stops answering.
- **Buffer** is the place a person looks for captions.
- The old **admin desk** (`admin.theplot.tv`) is retired. See [`docs/ops/retire-admin-review.md`](retire-admin-review.md).
- **Broadcast guide** (not content, listed under Adjacent) uploads a `broadcast-guide-health` artifact for 7 days. The content pipelines do not do that.

Gaps:

- No status page, dashboard, or Slack/Linear ping that says "Sunday batch succeeded, 14 posts in Buffer, 11 articles in Review". Success is the absence of an email.
- The Sunday job's own failure email cannot send if GitHub refuses it a runner. The daily queue check is the backup. That check is requested at 02:00 UTC and often starts hours later, still before 9:00am ET.
- Cron comments and real start times disagree by several hours. Buffer sends at the Eastern hour it was given. The reconcile catching up is a later clock. A post stored at 9:00am ET can already be in Buffer at a different ET hour from that channel's schedule.
- No alert when Linear mirror heartbeats stop, unless someone runs the SQL.
- No alert when Claude's pinned CLI version breaks a flag. That class of failure has already taken down a batch. The preflight in `cli-runner.mjs` helps only once the job is running.
- Social analytics are dark (section 13). You cannot see which tone is working from inside this system.
- IndexNow failures are a log line, not an email. Guides never enter that path.
- `marketing_review_events` once silently dropped every Linear action because the actor check rejected `linear`. The migration fixed it. The pattern (log write wrapped so it cannot fail the action) means a future logging bug stays invisible.

---

## Pain points for tone, correction, and evals

1. **Tone changes only when a person edits a markdown file.** The automated loop that was supposed to learn from shipped copy never applied a single week. `generated_copy` and `sent_text` are write-only history.
2. **Three places can change words, and only two are checked.** The model and a Linear `/copy` go through `articleRules.js`. A Buffer edit does not. The caption that ships can be one you typed in a hurry, and the next brief will not know you preferred it.
3. **Rejecting an article does not stop the post.** Correcting tone on the website leaves the social caption live unless you also delete it in Buffer. The review email and the Linear card do not show the social copy, on purpose. The Notion page does, as read-only reference, and still cannot edit the caption.
4. **There is no eval set.** Tests lock regexes (no em dash, no "according to", where-to-watch present). They cannot tell a warm specific note from a flat one that happens to pass. There is no labelled set of good and bad posts, no score, and no "run the new prompt on last month's briefs and diff".
5. **Two models.** CI is Claude (pinned CLI `2.1.226`). Local default is Codex. A prompt change tested locally is not the prompt that will run on Sunday unless you pass `--copy-runner=claude`.
6. **Regenerate is all or nothing.** `/regenerate` throws the copy away. There is no "rewrite the closer, keep the rest" in the production path. `sweep-closer.mjs` and `rewrite-published.mjs` are one-off scripts for that kind of repair.
7. **Guides and questions sit outside the review you see.** Guides have an article and a card but no social preview. Questions have social and no card. A tone pass that only reads Linear misses the questions. A pass that only reads Buffer misses the guides.
8. **Nothing closes the loop.** The Learning prep chip is gone, and so is the workflow behind it. Shipped copy still does not teach the next week. That gap is intentional until an eval loop is actually built.

---

## Adjacent automations (not the content machine)

Included so a search for "scheduled marketing" does not stop at the first cron.

| Workflow | Schedule | What it actually feeds |
| --- | --- | --- |
| [`.github/workflows/netflix-top10.yml`](../../.github/workflows/netflix-top10.yml) | Daily 12:00 UTC | `platform_charts` for the app's Netflix chart. Netflix Tudum TSV. Not Buffer, not /whats-on. |
| [`.github/workflows/streaming-top10.yml`](../../.github/workflows/streaming-top10.yml) | Wednesday 12:30 UTC | Prime, Max, Apple, Disney charts via Movie of the Night (or RapidAPI). Weekly because the free tier is small. App charts, not social. |
| [`.github/workflows/broadcast-guide.yml`](../../.github/workflows/broadcast-guide.yml) | Every 6 hours, and on guide-file pushes | TV guide snapshots in [`scripts/guide/refresh.py`](../../scripts/guide/refresh.py). Product data. Health artifact kept 7 days. |

Auth email templates (`scripts/push-auth-emails.mjs`) and the shared footer/token checks are brand consistency for product email, not a content calendar.

---

## Recommended next steps

Documentation only. None of this is built here.

### a. Make the system understandable

1. Treat this file plus `marketing/README.md` as the pair: map here, weekly operating steps there. When a workflow changes, update both.
2. Add one diagram to the Sunday review email: article path (Linear to /whats-on) and social path (Buffer), and the sentence "rejecting the card does not delete the posts".
3. Decide where `/marketing-week` lives. The email tells you to run it. The repo only has `marketing/REVIEW.md`.
4. The newsletter stays manual. The trending snapshot runs every Sunday evening Eastern (section 10).

### b. Standing health visibility

1. One daily note, not another inbox rule to ignore: batch succeeded or not, posts queued per channel, articles sitting in Review, age of the newest `linear_mirror` heartbeat, whether the GitHub dispatch tokens probed ok. Email is enough. A dashboard can wait.
2. Page that note off the daily reconcile, which is the job that still runs when Sunday cannot get a runner. State the real clock (requested at 02:00 UTC, often hours later, still before 9:00am ET) so the cron comment is not the only clock.
3. Alert when the Linear heartbeat is older than about ten minutes. The SQL already exists. Nothing sends it.
4. Alert when IndexNow fails, and submit guide URLs when a guide's day arrives. Today they rely on the sitemap alone.

### c. Tone and an eval loop

1. Keep `VOICE.md` as the source of truth. Do not revive an unattended rewriter. The last one prepared seven weeks and applied none.
2. Start a small labelled set: 10 to 20 briefs with a human "ship / rewrite" and a one-line reason, checked into the repo next to the voice file. Run the pinned Claude CLI against them when the voice or the validator changes, and read the diff. That is the eval. Regex tests stay as the hard gate.
3. Once a week, sample `sent_text` against `generated_copy` for posts you edited in Buffer. Those edits are the preference data the old loop wanted. Fold a rule into `VOICE.md` by hand when the same edit shows up twice.
4. Run that sample on question posts too. They never appear on the Linear board, so they are the captions most likely to drift.
5. Pin the eval to `--copy-runner=claude` so it matches Sunday.

---

## Needs a decision from Savannah

These are ambiguous from the repo alone.

1. **Changelog.** Not in the repo. Is one planned, and if so where should it live (What's On post type, a page, Buffer only)?
2. **Newsletter cadence.** The code is explicit that there is no schedule and that the product must not promise one. Is "I run it when I want an issue" still the plan?
3. **Social analytics.** The Meta insights path is gone and the report script is manual. Should reach stay a Buffer-side glance, or is a replacement in scope?
4. **`/marketing-week`.** The review email names it. The skill is not in the repo. Is it a local Claude command you still use, or is `marketing/REVIEW.md` the thing to point at?
5. **Empty timeline notes.** The Monday PR auto-merges even when the new title has no joke. The Linear card is only a record. Is that still what you want?
6. **Guide indexing.** Guides do not pass through Buffer, so IndexNow does not hear about them. Is the sitemap enough?

---

## Root commands

From the repo root, after `pnpm install`:

| Command | Runs |
| --- | --- |
| `pnpm run mkt:plan` | Planner only |
| `pnpm run mkt:guides` | SEO guides only |
| `pnpm run mkt:copy:pull` / `mkt:copy:save` | Briefs / validate |
| `pnpm run mkt:generate` | Render cards |
| `pnpm run mkt:schedule` | Push to Buffer |
| `pnpm run mkt:reconcile` | Read Buffer back |
| `pnpm run mkt:newsletter` | Digest (sends unless `DRY_RUN=1`) |
| `pnpm run mkt:snapshot` | Trending snapshot |
| `pnpm run mkt:report` | Performance email |
| `pnpm run mkt:backfill` | Missed-day seeder |
| `pnpm run mkt:manual` | Hand-built day |
| `pnpm run test:marketing` | Validator and planner tests |
