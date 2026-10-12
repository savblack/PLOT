# Weekly marketing review — agent runbook

The conversational control room for Plot's weekly marketing, as a runbook **any**
coding agent can follow (Claude Code, Codex, and others).

Article actions match `supabase/functions/_shared/reviewActions.js`.
Linear (`marketing-linear-sync`) and Notion (`marketing-notion-mirror`) both
call it. That module is the source of truth for approve, reject, unapprove,
reschedule, and publish-now. Do not re-queue publication rows or skip captions
as a side effect of approve or reject. Those writes can push a second copy into
Buffer or hold a caption back.

> Three places, one database. **Linear** (team PLO, project Content Automation,
> `https://linear.app/savblack/project/content-automation-2ce2d56ced11`) still
> approves and edits articles. **Notion** is the review database being stood up
> beside it. See "Notion review" below. Linear stays on until the edge secret
> `MARKETING_LINEAR_ENABLED` is `off`. **Buffer** (`https://publish.buffer.com`)
> is where a caption is edited, moved, or deleted. The old `admin.theplot.tv`
> desk is gone (`docs/ops/retire-admin-review.md`). If the human asks for
> something you can do here, write the database row, and say when it will show
> up on Linear and on the Notion page. Each mirror sweep is about five minutes.
> Do not approve the same article on both boards in one sitting. A second write
> is a no-op when the row already has that status.

You load the week from the database, show the human everything, and apply their
edits/approvals via the Supabase REST API. Everything is $0 and uses the repo's
existing contracts.

> Model-agnostic, like the copy worker (`marketing/copy/AGENT.md`). Nothing here
> depends on which agent you are.

## 0. Setup (do this first)
- Run from the **repo root on `main`** (not a worktree) so `.env` is present.
- `.env` must hold: `SUPABASE_URL` (or `VITE_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`
  (or `SUPABASE_SERVICE_KEY`), `BUFFER_API_KEY`, `TMDB_API_KEY`, `RESEND_API_KEY`.
  **Never print secret values.**
- You need **network access** (Supabase + Buffer + TMDB) and permission to run
  `node` and `gh`. Node 20+.
- Talk to the DB with Node + the REST API, e.g.:
  ```bash
  node --env-file=.env -e '
    const u=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL, k=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY;
    const h={apikey:k,Authorization:`Bearer ${k}`};
    fetch(`${u}/rest/v1/marketing_posts?...&select=...`,{headers:h}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2)));
  '
  ```
  For writes add `"Content-Type":"application/json"`, `Prefer:"return=representation"`, `method:"PATCH"`.

### Data model
- `marketing_posts`: `status`, `copy` (jsonb: x, instagram, threads, hashtags, alt_text,
  cta_variant, page_title, page_body[], sources[]), `media`, `scheduled_for`, `payload`,
  `slug`, `post_type`, `topic_key`, `tmdb_refs`.
- `marketing_post_publications`: one row per platform — `platform` (x/instagram/threads),
  `status` (queued→publishing→published/failed/skipped), `permalink`.
- `marketing_settings`: `publishing_paused`. `marketing_subscribers`: newsletter list.
- `marketing_posts.linear_issue_id` / `linear_issue_url`: the mirrored Linear issue,
  if the post has one. Include `linear_issue_url` in your summaries so the human can
  jump straight to it.
- `marketing_posts.notion_page_id` / `notion_page_url`: the mirrored Notion page,
  once that sweep has created one. Include `notion_page_url` the same way. Null
  means the page does not exist yet.
- Post types by Eastern Time weekday: Monday `trending`, Tuesday `upcoming`
  (then the mid question), Wednesday `watch_tonight`, Thursday a trailer or
  else a countdown (then the mid question), Friday `now_streaming`, Saturday
  `hidden_gem`, Sunday the lead question then `on_this_day`. If Thursday,
  Friday, or Sunday's non-question lead has no candidate, the fill mix runs.
  Fill types are `now_streaming`, `countdown`, `trailer`, and `on_this_day`,
  plus anniversary or spotlight when one qualifies. `question` is text-only.
- Lifecycle: `planned → copy_ready → generated → needs_review → approved → published`.
  `vetoed` = rejected. **Approval does not gate Buffer.** Social posts are not
  approved in chat. Once copy is saved and the card images exist, `schedule.mjs`
  pushes them into Buffer as scheduled posts on their planned day. Edit them in
  Buffer. Approval decides whether the **article** goes on theplot.tv once
  `scheduled_for` has passed. That decision stays on the Notion board (Linear,
  while that board is on). Rejecting an article does not change publication rows.
- **Cards before the queue.** Post types with a card template (`upcoming`,
  `trending`, `countdown`, `now_streaming`, `trailer`, `on_this_day`,
  `watch_tonight`, `hidden_gem`) are not pushed while `media` is null or has no
  portrait and landscape file. Those publication rows stay `queued`, the post's
  `error` says the cards are missing, and the daily job renders them before the
  next push. Do not attach a raw TMDB still or the brand image in their place.
  `question` posts are text-only (X and Threads) and have no card. `guide` posts
  are the website article only. This pipeline does not give them a social card.
- A copy file that fails validation does not stop the rest of the week. The
  posts that saved are rendered and queued. The weekly workflow then fails so
  the rejected copy is visible. Rejected posts stay `planned`.
- `marketing_review_events`: append-only audit trail. **After every edit, approve,
  reject, or publish action in §3–§5, POST one row here.** Nothing else logs
  actions taken through you. Skipping it is a permanent blind spot in the trail,
  not a cosmetic gap. `actor` is always `marketing_week_skill`, never a name.
  (Linear writes `linear`. Notion writes `notion`. Historical rows may say
  `web_desk` from the retired admin page. The surface is the only attribution
  there is.)
  ```bash
  node --env-file=.env -e '
    const u=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL, k=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY;
    const h={apikey:k,Authorization:`Bearer ${k}`,"Content-Type":"application/json"};
    fetch(`${u}/rest/v1/marketing_review_events`,{method:"POST",headers:h,
      body:JSON.stringify({actor:"marketing_week_skill",action:"approve",post_id:"<id>",after:{note:"optional"}})});
  '
  ```
  `action` is a free-text verb matching what you did (`edit`, `regenerate`, `reschedule`,
  `approve`, `approve_all`, `reject`, `unapprove`, `publish_now`, `retry`, `pause`, `resume`).
  `post_id` is required for per-post actions, omit it for week-wide ones (`approve_all`,
  `pause`, `resume`).

## 1. Load & summarise the week
Query active posts, grouped by Eastern Time day (`America/New_York`, not the UTC date):
`status=in.(planned,needs_review,copy_ready,generated,approved,vetoed)`,
`select=id,post_type,scheduled_for,status,slug,copy,payload,topic_key,tmdb_refs,marketing_post_publications(platform,status,permalink,error)`,
`order=scheduled_for`.
Give a tight summary: counts (needs review / approved / rejected), then per post the
day, the **why** (decode `topic_key`+`payload`+`tmdb_refs` like `reason()` in
`supabase/functions/_shared/postSummary.js`), status, target platforms, and
`linear_issue_url` and `notion_page_url` when the post has them. Lead with what
needs review. Send the human to the Notion page once it exists, and to the
Linear URL while that board is still on. Captions stay in Buffer.

## 2. Read the week locally when you need the full copy
One local page with every post's full copy (X / Instagram / Threads / article), its
card images, the "why" + platforms + sources, per-platform publish status, a paused
banner, recent-published history, and the rendered newsletter. Build it if you
need to read all of that in one place:
```bash
node --env-file=.env marketing/preview/week.mjs && open marketing/preview/out/week.html
```
Re-run after edits to refresh. The weekly email links Linear and Buffer.

**QA scan before approving** — flag (don't silently pass) anything off:
- A card date in the PAST or that contradicts the copy ("Streaming · March 31" on an
  "upcoming this week" card; a countdown "X days" that doesn't match the date).
  Dates a reader sees are US order (June 19, Friday, June 19).
- British spelling (colour, favourite, theatre, organise, programme) or a UK or
  Australian platform or release date. The post is for a US reader.
- An upcoming / now-streaming title that already released — not "new".
- X over 280 chars, a URL in the X copy, or an article that narrates its sources (§3).
Surface these with the fix (edit, regenerate, reschedule) rather than approving as-is.

## 3. Edit (conversational) — write to the DB
Follow the contracts: **`marketing/VOICE.md`** (voice + CTAs) and the article rules in
**`marketing/copy/brief.mjs`** (a finished editorial article, NEVER narrate sources).
Enforce **`marketing/copy/schema.mjs`** (re-exported from
`supabase/functions/_shared/copySchema.js`): X ≤280 chars, no URLs, no hashtags; Threads no
URLs; Instagram 3–5 hashtags. Questions are generic and text-only (X + Threads), never
tied to a title. You write the copy yourself (you are the copy worker too — do NOT call
a paid API; see `marketing/copy/AGENT.md`).
- **Article fields** (`page_title`, `page_body`, `cta_variant`): read current `copy`,
  spread, merge changed fields, PATCH `marketing_posts` (never drop other fields).
  Validate with the copy schema before writing, the same way `marketing-linear-sync`
  does. A failed check writes nothing.
- **Social fields** (`x`, `instagram`, `threads`, `hashtags`, `alt_text`): edit these
  in Buffer once the post is scheduled there. A database edit does not update a
  post Buffer already has. If the publication row is still `queued` (not in Buffer
  yet), patching those fields changes what the next push sends. Say which case
  you are in.
- **Edit copy shape**: `page_body` is an array of paragraphs. For a **guide** post
  with `copy.inline_titles === true`, that array is a strict 1:1 shape the renderer
  depends on — `page_body[0]` is the intro, `page_body[1..tmdb_refs.length]` is exactly
  one paragraph per `tmdb_refs` entry in order (its image renders next to that
  paragraph), and the last entry is the close. Editing text within a paragraph is fine;
  splitting, merging, adding, or removing one breaks the alignment. The renderer
  re-checks the length before trusting the flag, so a mismatch just falls back to the
  old end-of-article poster grid rather than showing misaligned images — but the
  per-title layout is lost for that post until regenerated.
- **Comparison table**: put it in its own paragraph, with a blank line before and
  after. GitHub-style markdown is the one to use in `/copy`:

  ```
  | Stay | Export | Switch |
  | --- | --- | --- |
  | Keep the diary | Download a file | Move the account |
  ```

  One row per line, including the `| --- |` separator. Do not wrap the table in a
  code fence, and do not leave a cell blank. A blank cell and a row break look the
  same once the lines have been flattened, and the page will show the pipes as
  text. A table that was already saved as one line of pipes still renders when
  every row has the same number of cells. If it does not, paste it again with
  the line breaks kept. Cells are plain text. Bold, links, and images in a markdown cell are not
  rendered. An HTML `<table>` in that same paragraph also works, if you need a
  cell to span columns or a `<strong>`. Allowed tags are `table`, `thead`,
  `tbody`, `tfoot`, `tr`, `th`, `td`, `caption`, `br`, `strong`, and `em`.
  `colspan`, `rowspan`, and `scope` are kept. Anything else is stripped, and a
  table that is not actually a table is shown as text. The article still needs
  at least three paragraphs. The table counts as one. No em or en dashes in the
  cells. The same rules as the rest of the article apply.
- **No hero image**: leave `hero_image` empty and do not attach a landscape still.
  The article is text-led. There is no image frame on the page, and the feed row
  does not keep an empty picture box. A post that still has a landscape file in
  `media` uses that file, which is how the trending chart keeps its card. Link
  previews fall back to the brand image when nothing else is there.
- **Regenerate**: rewrite the copy fresh per the contract and save (all fields).
  This does not edit or delete a post already sitting in Buffer.
- **Reschedule**: set `scheduled_for` to 9:00am Eastern on that calendar day.
  October 12, 2026 is `2026-10-12T13:00:00.000Z` (daylight time). January 15,
  2026 is `2026-01-15T14:00:00.000Z` (standard time). Do not write noon UTC.
  The Eastern day is the day the title and the article URL use. A Linear or
  Notion reschedule comment does this for you.
- **Bulk-edit in a spreadsheet** (best for many at once):
  `node --env-file=.env marketing/preview/copy-export.mjs && open marketing/preview/out/copy.csv`
  → edit the copy columns → `node --env-file=.env marketing/preview/copy-import.mjs --dry`
  to preview, then without `--dry` to apply. Keys by id, PATCHes only changed fields.
  Article columns are the ones to apply. Social columns only change what a later
  push sends, and only while that publication row is still `queued`. They do not
  update a post Buffer already has.
- **Log it**: one `marketing_review_events` row per post touched (§0), `action` = `edit`
  or `regenerate` or `reschedule`. For the bulk-spreadsheet path, one row per post is
  still preferred, but a single row summarizing the whole batch (`after` listing the ids)
  is acceptable if you edited many at once.

## 4. Approve / reject (article status only)
Touch `marketing_posts.status` and nothing else. Do not update
`marketing_post_publications`. Do not re-queue `skipped` or `failed` rows.
Do not set `queued` rows to `skipped`. Those side effects belonged to the old
desk and do not match Linear or Notion.

- **Approve**: `status='approved'`. The article goes on theplot.tv once its day
  arrives. Social posts are unaffected. Tell the human that.
- **Approve the week**, only if the human asks for every remaining article at
  once: every `needs_review` row that has a slug → `approved`. Still do not
  touch publication rows. Question posts have no article. Leave them. Prefer
  the human doing this on the Linear board, one card at a time, unless they
  asked you to write the rows. Once the Notion page exists, that board is the
  other place to do it one article at a time.
- **Reject**: `status='vetoed'`. The article stays off theplot.tv. Captions
  already in Buffer, and captions still `queued` in the database, still go out
  unless the human deletes them in Buffer. Do not skip the rows yourself.
- **Unapprove / restore**: `status='needs_review'`. Do not touch publication rows.
- **Log it**: one `marketing_review_events` row per action (§0). `action` is
  `approve`, `approve_all` (no `post_id`; put the affected ids in `after`),
  `reject`, or `unapprove`.

## 5. Publish
**Nothing here sends.** Social posts are pushed into Buffer once their copy and
cards are ready, with no chat approval, and Buffer sends them. A card post
with no rendered images stays `queued` until the daily render retry fills them.
Do not schedule one by hand with a TMDB backdrop. Approval governs the
**website article** only: an approved post appears on `/whats-on` once its
`scheduled_for` has passed. Articles still go through the Notion board.
- **To change or drop a social post**: do it in Buffer, on the post. Nothing
  needs to be told. The daily reconcile run reads the change back.
- **Article live now**: set it `approved` and `scheduled_for=now()`. No dispatch
  needed. `/whats-on` reads the row directly. Do not re-queue publication rows.
  Moving the caption earlier is a drag in Buffer, not a database write.
- **Retry a failed Buffer push** is a separate request, not part of approve or
  reject. Only do it when the human asks. Set that post's `failed` publication
  rows back to `queued` (clear `error`), then
  `gh workflow run marketing-publish.yml --repo savblack/PLOT -f retry_failed=true`.
  Do **not** re-queue `canceled` rows: those are posts deleted in Buffer, and
  re-queueing pushes back the thing that was removed. Do **not** re-queue rows
  as a side effect of approving.
- **Pause / Resume all**: PATCH `marketing_settings` (id=1) `publishing_paused = true/false`.
  This stops posts **entering** Buffer's queue. Anything already scheduled there
  is unaffected and must be removed in Buffer.
Buffer gotcha (handled in `marketing/publish/buffer.mjs`): Instagram needs
`metadata.instagram = { type: post, shouldShareToFeed: true }`; X copy must have no URL.
After a run, verify each post's `marketing_post_publications.status`/`permalink`.
- **Log it**: one `marketing_review_events` row (§0). `action` is `publish_now`, `retry`,
  `pause`, or `resume` (the last two take no `post_id`).

## Notion review

Savannah reviews What's On articles in a Notion database titled What's On review.
One page per article. The Name property is the article title (`copy.page_title`,
or the title the row falls back to when that field is empty). It does not
include the day or the post type. Those are the Scheduled and Post type
properties. The body is the article, the reason, and the read-only social copy.
There is no Commands section on the page. Social captions are still edited in
Buffer.

`marketing-notion-mirror` runs every five minutes, same cadence as the Linear
mirror. It creates missing pages, applies a Status or date edit, applies slash
comments, then rewrites the page from the row. `marketing-notion-sync` can wake
that comparison for one page. The sweep is what makes a missed webhook harmless
for Status and the date. Notion does not send the previous property value, so
the sweep stores `notion_observed_status` and `notion_observed_date` and treats
a difference as the only decision. That is the polling stand-in for Linear's
`updatedFrom.stateId`.

How to act, once the database exists:

- Set Status to Scheduled to approve, Review to send it back, Canceled to reject.
  Published is not a command. The sweep sets that when the article's day has arrived.
- Change the Scheduled date to move the day. Same write as a `/reschedule YYYY-MM-DD`
  comment.
- The page does not list slash commands. They still work as comments, including
  `/copy`. Comment `/copy` with `title:`, `body:`, or `cta:` to edit the article.
  Same parser and validators as Linear (`linearCommands.js`, `copySchema.js`).
  A failed check writes nothing.
- `/publish-now`, `/unapprove`, `/regenerate`, `/pause`, `/resume`, `/generate`,
  and `/help` are the same comments as on a Linear card.
- Approving sets `status` only. It does not touch `marketing_post_publications`
  or Buffer.
- The next sweep after this change rewrites existing pages. The body fingerprint
  now includes a shape mark the stored hash does not have, so Name and the body
  are painted again even when the article text is unchanged. That rewrite is
  not a status change and it is not a human edit. Status and Scheduled still
  count only when they differ from `notion_observed_status` and
  `notion_observed_date`.

Guards, same as Linear:

- A Status change counts only when the page differs from the status the sweep last wrote.
- If the row already has the target status, the sweep does not write it again.
- A Status edit does not walk `published` or `partially_published` backwards.
  A `/unapprove` comment still can.
- Replies start with the bot marker and are not parsed as commands.

Weekly website-refresh PR cards stay on Linear and GitHub. Notion does not merge
or close them. `MARKETING_LINEAR_ENABLED=off` turns off Linear article cards only.
Those PR cards, and `/pause`, `/resume`, `/generate`, `/help` on Linear, keep working.

Chat still writes rows with actor `marketing_week_skill`. You do not comment on
the Notion page unless the human is looking at it and asked you to. The mirror
picks the row up.

### Turn Notion on

Do this by hand. Merging the migration schedules the cron. The function answers
200 and writes nothing until the secrets exist. Do not deploy from this runbook
unless the human asked, and do not run the setup script against a live workspace
unless they asked for the database to be created.

1. Create a Notion internal integration and copy its token. Share the parent
   page with that integration.
2. Parent page. Savannah's Growth page, under 01 · Plot. Page id
   `3ed4f244-aec7-818c-8c18-c3f1228a4525`. Put that id in `NOTION_PARENT_PAGE_ID`.
   The script has no built-in parent.
3. Dry-run the schema, then create the database:

   ```bash
   DRY_RUN=1 node --env-file=.env marketing/setup/notion-review-db.mjs
   node --env-file=.env marketing/setup/notion-review-db.mjs
   ```

   The script prints the database id. It does not create article pages.

4. Supabase edge secrets, not GitHub:
   - `NOTION_TOKEN`, or `NOTION_API_KEY`
   - `NOTION_MARKETING_DATABASE_ID`, the id the script printed
   - Optional `NOTION_WEBHOOK_SECRET`. Subscribe the webhook at
     `<SUPABASE_URL>/functions/v1/marketing-notion-sync` for page property
     updates, page content updates, and comments. The first delivery is an
     unsigned `{ "verification_token": "..." }`. Paste that token into the
     secret. Until then event deliveries are refused and the cron still applies edits.
   - `/generate` and `/regenerate` reuse `GH_DISPATCH_TOKEN_CONTENT`
     (fallback `GH_DISPATCH_TOKEN`) and `GH_REPO`.

5. Dry-run the sweep before the first real tick:

   ```bash
   curl -sX POST "$SUPABASE_URL/functions/v1/marketing-notion-mirror" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H 'Content-Type: application/json' -d '{"dry_run": true}'
   ```

   Read `would_create`. Real sweeps create at most 15 pages each, newest
   `scheduled_for` first.

6. Leave Linear on. After a real week in Notion, set the edge secret
   `MARKETING_LINEAR_ENABLED` to `off` (`0`, `false`, and `no` also count).
   Unset, empty, or anything else keeps Linear article cards on. That secret
   is the switch. The migration does not flip it.

What is not the same as Linear:

- PR cards are Linear only.
- Comments on a page whose day was more than 21 days ago apply when the webhook
  fires, or if someone also edits the page. Status and the date are read every
  tick for every page in the database.
- Editing a comment the sweep already handled does not run it again.
- Typing in the page body, or in the Social copy property, is overwritten on
  the next refresh. `/copy` is the edit path.
- The first sweeps fill the board 15 pages at a time. Linear used to open a
  card for every eligible row in one pass.

## 6. Newsletter
Preview it locally:
```bash
DRY_RUN=1 node --env-file=.env marketing/newsletter/send-digest.mjs
```
Edit subject or content on request (the script is
`marketing/newsletter/send-digest.mjs`). **To send** (CONFIRM first: this emails
all `active` subscribers): `node --env-file=.env marketing/newsletter/send-digest.mjs`.

## Safety
- **Confirm before a newsletter send.** That email is public. Do not hold a
  social post for a chat approval. The pipeline queues it once copy and cards
  are ready, and the edit happens in Buffer. Editing or approving an article in
  the database is reversible. Changing a caption that is already in Buffer is
  not something this runbook can undo, because it cannot see Buffer's editor.
- **$0 only**: never use a paid API. You write copy yourself per the contract.
- Verify state with a read before and after each write. Report exactly what changed,
  plus Linear links and Notion links when the post has them. Article status
  shows up on each board on the next mirror sweep.
