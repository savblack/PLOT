# Weekly marketing review — agent runbook

The conversational control room for PLOT's weekly marketing, as a runbook **any**
coding agent can follow (Claude Code, Codex, …). It mirrors the web desk at
`admin.theplot.tv` (`supabase/functions/admin-review/index.ts`) — **that file is
the source of truth for every action's exact effect**. You load the week from the
database, show the human everything, and apply their edits/approvals via the
Supabase REST API. Everything is $0 and uses the repo's existing contracts.

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

### Data model (mirror admin-review)
- `marketing_posts`: `status`, `copy` (jsonb: x, instagram, threads, hashtags, alt_text,
  cta_variant, page_title, page_body[], sources[]), `media`, `scheduled_for`, `payload`,
  `slug`, `post_type`, `topic_key`, `tmdb_refs`.
- `marketing_post_publications`: one row per platform — `platform` (x/instagram/threads),
  `status` (queued→publishing→published/failed/skipped), `permalink`.
- `marketing_settings`: `publishing_paused`. `marketing_subscribers`: newsletter list.
- Post types: `upcoming`, `trending` (both Monday), `on_this_day` (Tue–Fri feature),
  `watch_tonight` (Sat), `hidden_gem` (Sun), plus event fill `now_streaming`,
  `countdown`, `trailer`, and a generic text-only `question`.
- Lifecycle: `planned → copy_ready → generated → needs_review → approved → published`.
  `vetoed` = rejected. **The publisher sends only `status='approved'` posts whose
  publication rows are `queued`.**
- `marketing_review_events`: append-only audit trail, read on the web desk as
  "Recent activity." **After every edit/approve/reject/publish action in §3–§5, POST
  one row here** — this runbook bypasses `admin-review/index.ts` entirely, so nothing
  else logs actions taken through you. Skipping it is a permanent blind spot in the
  trail, not a cosmetic gap. `actor` is always `marketing_week_skill` (never a name —
  auth here is one shared service key, same as the web desk's one shared password):
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
Give a tight summary: counts (needs review / approved / rejected), then per post — the
day, the **why** (decode `topic_key`+`payload`+`tmdb_refs` like `reason()` in admin-review),
status, and target platforms. Lead with what needs review.

## 2. Show the human everything — the review sheet
One readable page with every post's full copy (X / Instagram / Threads / article), its
card images, the "why" + platforms + sources, per-platform publish status, a paused
banner, recent-published history, and the rendered newsletter. Build + open it:
```bash
node --env-file=.env marketing/preview/week.mjs && open marketing/preview/out/week.html
```
Re-run after edits to refresh. (It is also served, auth-gated, at
`https://admin.theplot.tv/?view=sheet` once the weekly batch has uploaded it.)

**QA scan before approving** — flag (don't silently pass) anything off:
- A card date in the PAST or that contradicts the copy ("Streaming · 31 March" on an
  "upcoming this week" card; a countdown "X days" that doesn't match the date).
- An upcoming / now-streaming title that already released — not "new".
- X over 280 chars, a URL in the X copy, or an article that narrates its sources (§3).
Surface these with the fix (edit, regenerate, reschedule) rather than approving as-is.

## 3. Edit (conversational) — write to the DB
Follow the contracts: **`marketing/VOICE.md`** (voice + CTAs) and the article rules in
**`marketing/copy/brief.mjs`** (a finished editorial article, NEVER narrate sources).
Enforce **`marketing/copy/schema.mjs`**: X ≤280 chars, no URLs, no hashtags; Threads no
URLs; Instagram 3–5 hashtags. Questions are generic and text-only (X + Threads), never
tied to a title. You write the copy yourself (you are the copy worker too — do NOT call
a paid API; see `marketing/copy/AGENT.md`).
- **Edit copy**: read current `copy`, spread, merge changed fields, PATCH `marketing_posts`
  (never drop other fields). `page_body` is an array of paragraphs.
- **Regenerate**: rewrite the copy fresh per the contract and save (all fields).
- **Reschedule**: PATCH `scheduled_for = "<YYYY-MM-DD>T12:00:00.000Z"` (noon UTC renders
  as that AEST day and is before the publish run).
- **Bulk-edit in a spreadsheet** (best for many at once):
  `node --env-file=.env marketing/preview/copy-export.mjs && open marketing/preview/out/copy.csv`
  → edit the copy columns → `node --env-file=.env marketing/preview/copy-import.mjs --dry`
  to preview, then without `--dry` to apply. Keys by id, PATCHes only changed fields.
- **Log it**: one `marketing_review_events` row per post touched (§0), `action` = `edit`
  or `regenerate` or `reschedule`. For the bulk-spreadsheet path, one row per post is
  still preferred, but a single row summarizing the whole batch (`after` listing the ids)
  is acceptable if you edited many at once.

## 4. Approve / reject (mirror admin-review exactly)
- **Approve**: set `status='approved'` AND re-queue its publication rows
  (`status in (skipped,failed) → queued, error=null`). The publisher only sends `queued`
  rows — skipping the re-queue means it silently does nothing.
- **Approve the week**: every `needs_review` → `approved`, then re-queue all their rows.
- **Reject**: `status='vetoed'` and set its `queued` publication rows → `skipped`.
- **Unapprove / restore**: back to `needs_review`.
- **Log it**: one `marketing_review_events` row per action (§0) — `action` = `approve`,
  `approve_all` (no `post_id`; put the affected ids in `after`), `reject`, or `unapprove`.

## 5. Publish
Approved posts publish on their scheduled day via the daily GitHub run — nothing more
needed. **To send now** (CONFIRM first — it posts live to real socials):
`gh workflow run marketing-publish.yml --repo savblack/PLOT`.
Single post now: set it `approved`, `scheduled_for=now()`, re-queue its rows, then dispatch.
- **Retry a failed platform**: its failed publication rows `→ queued` and the post `→ approved`,
  then dispatch (or let the daily run pick it up).
- **Pause / Resume all**: PATCH `marketing_settings` (id=1) `publishing_paused = true/false`.
Buffer gotcha (handled in `marketing/publish/buffer.mjs`): Instagram needs
`metadata.instagram = { type: post, shouldShareToFeed: true }`; X copy must have no URL.
After a run, verify each post's `marketing_post_publications.status`/`permalink`.
- **Log it**: one `marketing_review_events` row (§0) — `action` = `publish_now`, `retry`,
  `pause`, or `resume` (the last two take no `post_id`).

## 6. Newsletter
Preview it in the sheet (§2). Edit subject/content on request (built in
`marketing/newsletter/send-digest.mjs`). **To send** (CONFIRM — emails all `active`
subscribers): `node --env-file=.env marketing/newsletter/send-digest.mjs`.

## Safety
- **Confirm before anything outward-facing** (publishing, sending the newsletter) — it's
  public and irreversible. Editing/approving in the DB is safe and reversible.
- **$0 only**: never use a paid API; you write copy yourself per the contract.
- Verify state with a read before and after each write; report exactly what changed (+ links).
- The web desk reads the same DB, so changes here show up there and vice-versa.
