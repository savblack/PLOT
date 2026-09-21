# Retire the admin desk

The hosted page at `admin.theplot.tv` (`supabase/functions/admin-review`) should go away. Articles are reviewed in Linear. Social posts are reviewed in Buffer. This note is the cutover. It does not delete the desk.

`docs/ops/operator-desk-shelved.md` is a different thing: an unmerged React replacement from July 2026. Do not revive it as the way off this page.

`docs/ops/gtm-automations.md` is not on `main` yet. It is the map in PR #1016. The paragraph to add there is at the bottom of this file.

## What already works without the desk

A normal week does not need the page.

1. `marketing-weekly-batch.yml` plans the week, writes copy, renders cards, and pushes social posts into Buffer. It does not wait for an approval.
2. `marketing-linear-mirror` opens one Linear card per website article (team PLO, project Content Automation) and files it from the database row. Question posts get no card. They have no article.
3. Comments and drags on those cards are applied by `marketing-linear-sync`: `/approve`, `/reject`, `/unapprove`, `/copy` (article title, body, CTA), `/reschedule`, `/publish-now`, `/regenerate`, `/pause`, `/resume`, `/generate`. Dragging to Scheduled, Canceled, or Review matches approve, reject, and unapprove.
4. Buffer holds the captions, the preview, the character counter, and the calendar. Buffer sends. Edit, move, or delete the post there.
5. `marketing-publish.yml` (daily) asks Buffer what happened, writes it back, and fills slots the day's sends freed. `workflow_dispatch` input `retry_failed` re-pushes rows that never reached Buffer.
6. `/pause` sets `marketing_settings.publishing_paused`. The scheduler reads that flag and stops **new** posts entering Buffer. Posts already in Buffer still go out until you delete them there.

Linear and Buffer do not gate each other. A rejected article stays off theplot.tv and does not pull a caption out of Buffer. That split is deliberate. See `marketing/README.md`.

## What the desk still does

The page is one server-rendered HTML function, password-gated, proxied by the marketing site.

| Capability | Where it lives | Linear | Buffer | Still only on the desk? |
| --- | --- | --- | --- | --- |
| Article approve / reject / unapprove | `marketing_posts.status` | Yes (`/approve`, `/reject`, `/unapprove`, or drag) | No | No, but the desk's version also touches publication rows. See drift below. |
| Approve every article in one click | `approve_all` in `admin-review` | No | No | Yes |
| Article edit (title, body) | `marketing_posts.copy` | Yes (`/copy`, validated) | No | No. The desk saves without the copy contract. |
| CTA edit | `copy.cta_variant` | Yes (`cta:`) | No | No |
| Social caption edit (X, Instagram, Threads, hashtags) | Desk form writes `marketing_posts.copy` | Removed on purpose | Yes, for posts already in the queue | The desk is the only **screen** for captions that are not in Buffer yet. It does not update a post Buffer already has. |
| Question posts (no article) | Desk lists them | No card | Yes | Buffer is the review. The desk still shows an X editor that writes the database, not Buffer. |
| Reschedule the article's day | `scheduled_for` + unpublished slug | Yes (`/reschedule`) | Move the caption's clock time there | No for the day. Buffer owns the time of day. |
| Article live now | status approved, `scheduled_for` = now | Yes (`/publish-now`) | Drag the caption earlier if you want it sooner | No |
| Regenerate copy | status `planned`, copy cleared, dispatch weekly batch | Yes (`/regenerate`) | Does not update a post already queued | No. Neither side edits the Buffer post. |
| Build the week off-schedule | dispatch `marketing-weekly-batch.yml` | Yes (`/generate`, any card) | No | No. The desk only dispatches that workflow from a per-post Regenerate. |
| Pause / resume new pushes into Buffer | `marketing_settings.publishing_paused` | Yes (`/pause`, `/resume`) | Does not empty the queue | No |
| Retry a failed push | Desk sets failed publication rows back to `queued` | Removed on purpose | No | The same re-queue is `retry_failed` on `marketing-publish.yml`. The desk does not start that workflow. |
| Reject also skips not-yet-pushed rows | Desk sets `queued` publication rows to `skipped` | Does not touch those rows | Delete the post if it is already scheduled | Yes. This is the one decision the desk still makes that Linear refuses. |
| Approve also re-queues `skipped` / `failed` rows | `requeuePubs` in the desk | Removed on purpose (it can schedule a second copy) | No | Yes, and it is unsafe to keep using. |
| Week sheet | Private bucket `marketing-review` / `week.html`, served at `/?view=sheet` | Article only | Captions only, and only the next ~4 days | Yes. One page of every caption, every article, cards, and the newsletter dry-run. |
| Newsletter preview | Inlined in that sheet (`marketing/preview/week.mjs`) | No | No | Yes, as a hosted page. Local dry-run of `marketing/newsletter/send-digest.mjs` still works. |
| Guide poster preview | Inline on the card | Article prose and landscape cards | No | The paired poster layout is only on the desk (and the sheet). |
| Per-platform status chips | `marketing_post_publications` | No | The queue itself | The chips are a view. Buffer and the daily reconcile are the record. |
| Recently published, with views and likes | Last 14 days from `marketing_metrics` | No | Buffer's own stats | The desk is the only in-app view. `marketing/metrics/report.mjs` still emails a report when run by hand. |
| Audit trail | `marketing_review_events` | Writes `actor=linear`. No list UI. | No | The list UI is only on the desk. The table stays either way. |
| Batch run list | `marketing_batch_runs` | No | No | The list UI is only on the desk. GitHub Actions has the workflow runs. |
| Workflow health chips | GitHub Actions API | Token probe emails you if a dispatch PAT dies | No | Weekly batch and Publish chips duplicate Actions. The Learning prep chip asks for `marketing-learning-prep.yml`, which is gone. PR #1016 removes that chip. |
| Website-refresh PR (timeline) | Not on the desk | Yes (card on the same board) | No | No |
| Sign-in | `ADMIN_PASSWORD` or `ADMIN_TOKEN`, HttpOnly cookie, per-IP throttle | Linear login | Buffer login | Yes |

## Drift: why clicking the desk is riskier than Linear

The desk was the source of truth, then Linear was built to mirror it, then the Buffer split changed Linear and left the desk behind.

- **Approve on the desk** sets the article to `approved` and re-queues `skipped` and `failed` publication rows (`requeuePubs` in `supabase/functions/admin-review/index.ts`). **Approve in Linear** only sets the article status. The sync comment says a re-queue would push a second copy into Buffer.
- **Reject on the desk** sets the article to `vetoed` and marks still-`queued` publication rows `skipped`, so a caption that has not entered Buffer yet will not enter it. **Reject in Linear** only vetoes the article. The flash on the desk already tells you to delete anything already in Buffer by hand.
- **Save on the desk** writes social fields into `marketing_posts.copy` with a character counter and no copy-contract check. If that row is still `queued`, the next scheduler push uses the new text. If Buffer already has the post, the desk edit does not change it. A `/copy` comment in Linear cannot name `x`, `instagram`, or `threads` at all.
- **`marketing/REVIEW.md`** still says "mirror admin-review exactly" for approve and reject, including the re-queue and the skip. An agent following that runbook can do the unsafe writes without opening the page.

Until those three match Linear, the desk is not a harmless second window. It is a different publisher.

## Gaps that still send someone to the desk

These are the reasons the page is not dead yet.

1. **Captions that are not in Buffer yet.** The plan holds about 10 scheduled posts per channel. A week is about 16. The visible Buffer queue is roughly four days. Captions past that window live only in `marketing_posts.copy`. Linear will not edit them. Buffer does not have them. The desk form, the marketing-week skill, and `marketing/preview/copy-export.mjs` are the editors. Waiting until the daily top-up pushes them, then editing in Buffer, is the path that needs no new tool.
2. **The week sheet and the newsletter preview.** The weekly batch uploads `week.html` and the review email links `https://admin.theplot.tv/?view=sheet` (`marketing/generate/generate.mjs`, `hostReviewSheet` / `notifyReview`). Supabase storage serves that HTML as plain text, so the desk is the only thing that renders it. The email also links Linear and the desk.
3. **Approve-the-week.** One button. Linear is one card at a time. There is no `/approve-week`.
4. **Reject that also holds back captions not yet in Buffer.** Only the desk (and `marketing/REVIEW.md`) do this. Linear will not, on purpose.
5. **A screen for "what ran" and "what did the last fortnight get".** Batch rows, the audit list, and the views/likes strip have no other UI. GitHub Actions and the manual metrics email cover the same facts with worse browsing.

None of these require a new product. They require a decision about which of them you still use.

## Phased retirement

Do not delete the host in the first change. The page is live, and the unsafe buttons are the thing to stop relying on before the URL goes away.

### Phase 1: stop using the desk as the publisher

Recommended first code change after this note. No DNS, no function delete.

- Treat Linear as the only place an article is approved, rejected, edited, rescheduled, or published now.
- Treat Buffer as the only place a caption is edited, moved, or deleted. For a caption that is not in the queue yet, either wait for the daily top-up or patch `marketing_posts.copy` with the marketing-week skill / `copy-export` + `copy-import`. Do not use the desk's Save, Approve, or Reject.
- Rewrite `marketing/REVIEW.md` so section 4 matches `marketing-linear-sync`: approve and reject change `marketing_posts.status` only. Drop the re-queue and the skip. Point section 6's newsletter preview at the local dry-run until a replacement for the sheet exists.
- Change the weekly email in `marketing/generate/generate.mjs` so the primary links are the Linear project and Buffer. Keep the sheet link only if you still want that page during the cutover, and label the desk as retiring.
- Add the short note at the bottom of this file to `docs/ops/gtm-automations.md` when #1016 merges.
- Leave `admin.theplot.tv` up so a bookmark still loads.

### Phase 2: close the gaps you still feel

Only build the ones you answer "yes" to in the questions below. Prefer Linear and Buffer.

- **Bulk article approve**, if one click still matters: a week-scoped `/approve-week` in `linearCommands.js` + `marketing-linear-sync` that sets `needs_review` rows to `approved` and does **not** call anything like `requeuePubs`.
- **Captions outside the Buffer window**, if waiting four days is too late: keep editing them through `copy-export` / the skill, or accept Buffer-only once they land. Do not add social fields back onto the Linear card.
- **Newsletter preview**, if you still open the sheet for it: attach the dry-run HTML to the existing review email, or keep running `send-digest.mjs` with `DRY_RUN=1` locally. Do not stand up another hosted page.
- **Metrics and run history**, if you still open the desk for them: the emailed report and GitHub Actions are enough. A Linear view of `marketing_batch_runs` is optional and not required to delete the page.
- **Week sheet**: stop uploading it once nothing links to `/?view=sheet`. `marketing/preview/week.mjs` can stay as a local script.

PR #1016 already deletes the Learning prep chip. Do not re-add it. No other route in the function exists only for that loop.

### Phase 3: delete the host

After a week in which you have not needed the page:

- Remove the `admin.theplot.tv` branch in `apps/website/functions/_middleware.js`, `apps/website/functions/_lib/admin.js`, and the robots test in `apps/website/functions/_lib/middleware.test.js`.
- Remove `supabase/functions/admin-review/` and the `[functions.admin-review]` block in `supabase/config.toml`. Deploy that absence (`supabase functions delete admin-review`) only after the proxy is gone, or the proxy 502s.
- Remove the custom domain `admin.theplot.tv` from the marketing site's Cloudflare Pages project. This repo does not declare that domain in wrangler. It is dashboard DNS plus a Pages custom domain.
- Unset the Edge secrets `ADMIN_PASSWORD` and `ADMIN_TOKEN`. Nothing else reads them.
- Stop `hostReviewSheet` in `marketing/generate/generate.mjs`. The private `marketing-review` bucket can stay until you are sure; dropping a bucket is a separate, explicit step.
- Update the pointers in `marketing/README.md`, `marketing/REVIEW.md`, `marketing/manual/README.md`, and the admin-desk sentence in `AGENTS.md`.
- `apps/web/tests/unit/analyticsHost.test.js` asserts `admin.theplot.tv` is **not** an analytics host. Keep that assertion until the hostname is gone, then delete the case with the hostname.

Do not drop `auth_fail_attempts`. Signup bypass and `media-sync` use the same table, with their own scopes. Do not drop `marketing_review_events`, `marketing_posts`, or `marketing_settings`. Do not drop the empty `operator_*` tables. Those belong to the shelved desk, not this page.

## Hosting and deploy pieces that go away

| Piece | Role | When it can go |
| --- | --- | --- |
| Cloudflare Pages custom domain `admin.theplot.tv` on the marketing site | Every request on that host is routed to the proxy | Phase 3, after the function is unused |
| `apps/website/functions/_middleware.js` host check | Sends that host to `admin()`, plus a disallow-all `robots.txt` | Phase 3 |
| `apps/website/functions/_lib/admin.js` | Forwards GET/POST, cookie, and client IP to the Edge Function. Does not forward `?key=` | Phase 3 |
| `supabase/functions/admin-review` | The page. `verify_jwt = false` because it does its own password check | Phase 3, then delete the deployed function |
| Secrets `ADMIN_PASSWORD`, `ADMIN_TOKEN` | Login | Phase 3 |
| Bucket `marketing-review` object `week.html` | The sheet | After the email and the page no longer fetch it |
| `GH_DISPATCH_TOKEN_CONTENT` on the function | Desk Regenerate dispatches the weekly batch | The Linear sync uses the same secret. Keep it. |

The marketing site itself (theplot.tv) stays. Only the admin host on that Pages project goes.

## Risks and rollback

- **Using the desk during the cutover can double-post or suppress a caption.** Approve re-queues failed and skipped rows. Reject skips rows that are still `queued`. Linear does neither. Phase 1 is "stop clicking those buttons", not "turn the site off".
- **Deleting the function while the custom domain still points at Pages** serves the proxy's "briefly unavailable" 502, or a login that 404s upstream. Remove the host route and the domain together.
- **Rollback of phase 3** is reverting the commit and confirming the Edge Function and the two secrets still exist. DNS for a removed custom domain is the slow part. Do not unset secrets in the same hour as the code delete.
- **The marketing-week skill** writes the database directly. Deleting the page does not stop it. If `marketing/REVIEW.md` still says to re-queue, the unsafe behavior survives the deletion.
- **`/regenerate` and a desk Regenerate** clear copy and start the weekly worker. They do not edit or delete the Buffer post already scheduled. A regenerated caption can sit in the database beside an older Buffer post. That is true today on both surfaces.
- **Pause** never empties Buffer. Retiring the desk does not change that.

## Delta for `docs/ops/gtm-automations.md`

That file is added in PR #1016 and is not on `main`. When it merges, add this section after "Observability today" (or next to the admin-desk bullet in that section):

```markdown
## Admin desk (retiring)

`https://admin.theplot.tv` is still up. It is not the review surface to keep.
Articles are approved in Linear. Social posts are edited in Buffer. The cutover,
including what the page still does that those two do not, is
[`docs/ops/retire-admin-review.md`](retire-admin-review.md).

Do not click Approve, Reject, or Save on the desk while it is still up. Those
buttons still change publication rows in ways Linear stopped doing, and a desk
edit of a caption does not update a post Buffer already has. The Learning prep
chip is already removed on the automations map; the page itself is a later delete.
```

## Questions only Savannah can answer

1. Do you still open the week sheet (`/?view=sheet`), or the "Read the full week" button in the review email? If you do not, phase 2 can drop the upload.
2. Do you preview the newsletter on that sheet before `send-digest.mjs`, or do you already read it another way?
3. Do you use **Approve week**, or do you approve Linear cards one by one? If you need one click, the replacement is a `/approve-week` that only flips article status.
4. When you reject an article, do you also want captions that have **not** reached Buffer yet to stay out of the queue? Today only the desk does that. Linear leaves them to be scheduled, and you delete them in Buffer if they are already there.
5. For a caption more than about four days out (not in Buffer yet), is "wait until it lands, then edit in Buffer" acceptable? If it is not, say so. The fallback that already exists is the copy spreadsheet and the marketing-week skill, not a new UI.
6. Do you use the desk's recently-published views and likes, or is the manual metrics email enough?
7. Is anyone other than you signing in at `admin.theplot.tv`?
8. Confirm question posts stay Buffer-only (no Linear card), which is already how the mirror works.
9. Confirm the Cloudflare Pages custom domain `admin.theplot.tv` is yours to remove in phase 3. This plan does not change DNS.
