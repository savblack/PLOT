# Weekly marketing review — agent runbook

The conversational control room for Plot's weekly marketing, as a runbook **any**
coding agent can follow (Claude Code, Codex, and others).

Article actions match `supabase/functions/marketing-linear-sync/index.ts`.
That function is the source of truth for approve, reject, unapprove, reschedule,
and publish-now. **Do not copy `admin-review`.** Its Approve, Reject, and Save
buttons still re-queue publication rows and skip captions. Those writes can
push a second copy into Buffer or hold a caption back. This runbook must not
do either.

> Two review surfaces, one database. **Linear** (team PLO, project Content
> Automation, `https://linear.app/savblack/project/content-automation-2ce2d56ced11`)
> is where an article is approved or edited. **Buffer**
> (`https://publish.buffer.com`) is where a caption is edited, moved, or deleted.
> `admin.theplot.tv` is still hosted and is not a review step. If the human asks
> for something you can do here, do it here, and say when it will show up on the
> Linear board (the mirror sweep, within about five minutes).

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
- Post types: `upcoming`, `trending` (both Monday), `on_this_day` (Tue–Fri feature),
  `watch_tonight` (Sat), `hidden_gem` (Sun), plus event fill `now_streaming`,
  `countdown`, `trailer`, and a generic text-only `question`.
- Lifecycle: `planned → copy_ready → generated → needs_review → approved → published`.
  `vetoed` = rejected. **Approval does not gate Buffer.** The scheduler pushes
  social copy for `needs_review` and `approved` posts whose publication rows are
  still `queued`. Approval decides whether the **article** goes on theplot.tv
  once `scheduled_for` has passed. Rejecting an article does not change those rows.
- `marketing_review_events`: append-only audit trail. **After every edit, approve,
  reject, or publish action in §3–§5, POST one row here.** Nothing else logs
  actions taken through you. Skipping it is a permanent blind spot in the trail,
  not a cosmetic gap. `actor` is always `marketing_week_skill`, never a name.
  (Linear writes `linear`. The retiring web desk writes `web_desk`. The surface
  is the only attribution there is.)
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
Query active posts, grouped by AEST (Australia/Sydney) day:
`status=in.(planned,needs_review,copy_ready,generated,approved,vetoed)`,
`select=id,post_type,scheduled_for,status,slug,copy,payload,topic_key,tmdb_refs,marketing_post_publications(platform,status,permalink,error)`,
`order=scheduled_for`.
Give a tight summary: counts (needs review / approved / rejected), then per post the
day, the **why** (decode `topic_key`+`payload`+`tmdb_refs` like `reason()` in
`supabase/functions/_shared/postSummary.js`), status, target platforms, and
`linear_issue_url` when the post has one. Lead with what needs review. Send the
human to that Linear URL for the article, and to Buffer for the caption. Do not
send them to `admin.theplot.tv`.

## 2. Read the week locally when you need the full copy
One local page with every post's full copy (X / Instagram / Threads / article), its
card images, the "why" + platforms + sources, per-platform publish status, a paused
banner, recent-published history, and the rendered newsletter. Build it if you
need to read all of that in one place:
```bash
node --env-file=.env marketing/preview/week.mjs && open marketing/preview/out/week.html
```
Re-run after edits to refresh. Do not tell the human to open
`https://admin.theplot.tv/?view=sheet`. That host is retiring. The weekly email
links Linear and Buffer instead.

**QA scan before approving** — flag (don't silently pass) anything off:
- A card date in the PAST or that contradicts the copy ("Streaming · 31 March" on an
  "upcoming this week" card; a countdown "X days" that doesn't match the date).
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
  you are in. Do not use the admin desk's editor.
- **Edit copy shape**: `page_body` is an array of paragraphs. For a **guide** post
  with `copy.inline_titles === true`, that array is a strict 1:1 shape the renderer
  depends on — `page_body[0]` is the intro, `page_body[1..tmdb_refs.length]` is exactly
  one paragraph per `tmdb_refs` entry in order (its image renders next to that
  paragraph), and the last entry is the close. Editing text within a paragraph is fine;
  splitting, merging, adding, or removing one breaks the alignment. The renderer
  re-checks the length before trusting the flag, so a mismatch just falls back to the
  old end-of-article poster grid rather than showing misaligned images — but the
  per-title layout is lost for that post until regenerated.
- **Regenerate**: rewrite the copy fresh per the contract and save (all fields).
  This does not edit or delete a post already sitting in Buffer.
- **Reschedule**: PATCH `scheduled_for = "<YYYY-MM-DD>T12:00:00.000Z"` (noon UTC renders
  as that AEST day and is before the publish run).
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
Do not set `queued` rows to `skipped`. Those were the admin desk's buttons,
and they do not match Linear.

- **Approve**: `status='approved'`. The article goes on theplot.tv once its day
  arrives. Social posts are unaffected. Tell the human that.
- **Approve the week**, only if the human asks for every remaining article at
  once: every `needs_review` row that has a slug → `approved`. Still do not
  touch publication rows. Question posts have no article. Leave them. Prefer
  the human doing this on the Linear board, one card at a time, unless they
  asked you to write the rows.
- **Reject**: `status='vetoed'`. The article stays off theplot.tv. Captions
  already in Buffer, and captions still `queued` in the database, still go out
  unless the human deletes them in Buffer. Do not skip the rows yourself.
- **Unapprove / restore**: `status='needs_review'`. Do not touch publication rows.
- **Log it**: one `marketing_review_events` row per action (§0). `action` is
  `approve`, `approve_all` (no `post_id`; put the affected ids in `after`),
  `reject`, or `unapprove`.

## 5. Publish
**Nothing here sends.** Social posts are pushed into Buffer when the week is
rendered, and Buffer sends them. Approval governs the **website article** only:
an approved post appears on `/whats-on` once its `scheduled_for` has passed.
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

## 6. Newsletter
Preview it locally. Do not use the admin desk sheet.
```bash
DRY_RUN=1 node --env-file=.env marketing/newsletter/send-digest.mjs
```
Edit subject or content on request (the script is
`marketing/newsletter/send-digest.mjs`). **To send** (CONFIRM first: this emails
all `active` subscribers): `node --env-file=.env marketing/newsletter/send-digest.mjs`.

## Safety
- **Confirm before anything outward-facing** (publishing, sending the newsletter).
  It is public and irreversible. Editing or approving an article in the database
  is reversible. Changing a caption that is already in Buffer is not something
  this runbook can undo, because it cannot see Buffer's editor.
- **$0 only**: never use a paid API. You write copy yourself per the contract.
- Verify state with a read before and after each write. Report exactly what changed,
  plus Linear links.
- Do not send the human to `admin.theplot.tv`, and do not reproduce its Approve,
  Reject, or Save effects. Article status shows up on the Linear board on the
  next mirror sweep.
