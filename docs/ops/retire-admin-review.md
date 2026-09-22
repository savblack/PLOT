# Retire the admin desk

The hosted page at `admin.theplot.tv` (`supabase/functions/admin-review`) should go away. Articles are reviewed in Linear. Social posts are reviewed in Buffer. This note is the cutover. It does not delete the desk.

**Phase 1 is implemented. Phase 2 is planned and awaiting a human cutover** (PR #1017). Savannah does not use the desk. Rejecting an article leaves social posts alone (Linear's behavior, and the agent runbook). This PR does not remove the Cloudflare domain, does not unset secrets, and does not undeploy `admin-review`.

Already done in this PR:

- `marketing/generate/generate.mjs` (`notifyReview`): the email's buttons are the Content Automation project and `https://publish.buffer.com`. No desk link.
- The weekly batch no longer uploads `week.html`. Nothing else reads that object except the desk's Sheet view, which Savannah does not use. The last uploaded object stays in the private `marketing-review` bucket until the cutover deletes it. `marketing/preview/week.mjs` still builds a local file when someone runs it.
- `marketing/REVIEW.md`: approve and reject set `marketing_posts.status` only.
- Operator docs name the desk only as still hosted.

Not done here, on purpose:

- The live function, the Pages proxy, the custom domain, and DNS. The desk's Approve, Reject, and Save buttons still rewrite publication rows if someone opens the page. There is no feature flag, and the function has no tests, so this PR does not turn those buttons into no-ops. Stopping them means undeploying the function, which is a human step below.
- Captions that have not entered Buffer yet can still be edited only in the database (`marketing/REVIEW.md`, or `copy-export`). Linear will not edit them. That is not a reason to keep the host.

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
- **`marketing/REVIEW.md`** used to say "mirror admin-review exactly" for approve and reject. Phase 1 rewrote it: those actions set article status only. The desk's own buttons are unchanged and still unsafe if used.

Until those three match Linear, the desk is not a harmless second window. It is a different publisher.

## Gaps that still send someone to the desk

These are the reasons the page is not dead yet.

1. **Captions that are not in Buffer yet.** The plan holds about 10 scheduled posts per channel. A week is about 16. The visible Buffer queue is roughly four days. Captions past that window live only in `marketing_posts.copy`. Linear will not edit them. Buffer does not have them. The desk form, the marketing-week skill, and `marketing/preview/copy-export.mjs` are the editors. Waiting until the daily top-up pushes them, then editing in Buffer, is the path that needs no new tool.
2. **The week sheet.** The batch no longer uploads it. The desk's Sheet view still serves whatever object was uploaded last, until that object is deleted at cutover. A local preview is `marketing/preview/week.mjs`. Newsletter preview is `DRY_RUN=1` on `send-digest.mjs`.
3. **Approve-the-week.** One button on the desk. Linear is one card at a time. Not required. Do not add `/approve-week` unless asked.
4. **Reject that also holds back captions.** The desk still does this if someone clicks Reject. Linear does not, and that is the decision: leave social posts alone. The runbook matches Linear. The live button does not, until the function is undeployed.
5. **A screen for "what ran" and "what did the last fortnight get".** Batch rows, the audit list, and the views/likes strip have no other UI. GitHub Actions and the manual metrics email cover the same facts with worse browsing.

None of these are a new product. The host can go without them.

## Phase 1: stop using the desk as the publisher

Done. See the top of this file.

## Phase 2: teardown planned, awaiting cutover

Do these in order. Steps 1 and 2 are merges. Step 3 is a later code PR (not this one): merging it deploys the marketing site, because Cloudflare Pages deploys `plot-site` on merge to `main`. Steps 4 through 8 are clicks and CLI commands. This run does not execute 4 through 8.

Nothing in GitHub Actions calls `admin-review`. The only caller is the Pages proxy in `apps/website/functions/_middleware.js`, which forwards `admin.theplot.tv` to the function. The weekly batch does not POST to it. The raw function URL is still public at the gateway (`verify_jwt = false` in `supabase/config.toml`), gated by `ADMIN_PASSWORD` / `ADMIN_TOKEN`: `https://mkegtssedjyqldysvzga.supabase.co/functions/v1/admin-review`. Deleting the domain does not close that URL. Deleting the function does.

### 1. Merge PR #1016 first (code, GitHub)

Still open as of this plan. It removes the dead Learning prep chip from the desk. Merge it while the function file still exists. The teardown PR below deletes that file, so landing #1016 first avoids a modify/delete conflict. If #1016 is closed instead, do not re-add the chip.

### 2. Merge PR #1017 (code, GitHub)

This PR. After it is on `main`, the next `marketing-weekly-batch.yml` run stops uploading `week.html` and keeps emailing Linear and Buffer. The host stays up. No Cloudflare or Supabase click is required for that.

### 3. Teardown code PR (code, a later agent or you)

Branch off `main` after steps 1 and 2. Do not call Cloudflare or Supabase from CI. Merging deploys `plot-site` only (the website). It does not undeploy the Edge Function. Supabase functions deploy only when someone runs the CLI.

Replace the admin host with a plain 410, then delete the proxy. If you only delete the host check, `admin.theplot.tv` falls through to the marketing site and serves theplot.tv on the admin hostname. A 410 avoids that for as long as the domain still points at Pages.

- `apps/website/functions/_middleware.js`: for host `admin.theplot.tv`, return `410 Gone`, `content-type: text/plain`, body `This page has been removed.`, and `X-Robots-Tag: noindex, nofollow`. Keep the `robots.txt` disallow. Do not call `admin()`.
- Delete `apps/website/functions/_lib/admin.js` once nothing imports it.
- `apps/website/functions/_lib/middleware.test.js`: expect 410 on `https://admin.theplot.tv/` and keep the robots test.
- Delete `supabase/functions/admin-review/` (the whole directory).
- Delete the `[functions.admin-review]` block in `supabase/config.toml`.
- `apps/web/tests/unit/analyticsHost.test.js`: the assertion that `admin.theplot.tv` is not an analytics host can go once the hostname is gone. Leave it until this PR if you want the allowlist comment to stay accurate one commit longer. Deleting the case in this same PR is fine.
- Point `marketing/README.md`, `marketing/REVIEW.md`, `marketing/manual/README.md`, and the admin-desk sentence in `AGENTS.md` at this file, and drop "still hosted" once the 410 is the behavior.
- Do not drop `auth_fail_attempts`. Signup bypass and `media-sync` use that table. Do not drop `marketing_review_events`, `marketing_posts`, or `marketing_settings`. Do not drop the empty `operator_*` tables (`docs/ops/operator-desk-shelved.md`).
- Do not touch `GH_DISPATCH_TOKEN_CONTENT`. Linear `/generate` and `/regenerate` use it. The desk's Regenerate button uses the same secret. Keep the secret.

### 4. Confirm the 410, then remove the custom domain (Cloudflare, you)

Pages project name is `plot-site` (theplot.tv). The app project is `plot` (`app.theplot.tv`). The domain is not in wrangler. See the comment in `apps/web/wrangler.toml`.

1. Wait until the teardown PR's Pages deploy for `plot-site` is finished.
2. Open `https://admin.theplot.tv/`. You want `410` and the plain sentence. You do not want the marketing homepage, and you do not want the review UI.
3. Dashboard: Workers & Pages → `plot-site` → Custom domains → `admin.theplot.tv` → Remove domain.
4. Dashboard: the `theplot.tv` zone → DNS → Records. If an `admin` CNAME (or A/AAAA) is still there, delete that record. Pages often removes it with the custom domain. Check anyway.
5. Do not remove `theplot.tv` or `app.theplot.tv`.

Rollback for this step: Workers & Pages → `plot-site` → Custom domains → Set up a custom domain → `admin.theplot.tv`. Pages recreates the DNS record when the zone is on the same account. If the teardown code is still deployed, the hostname comes back as the 410, not as the old desk. To restore the desk, also revert that PR and redeploy the function (step 6) before the domain is useful again.

### 5. Undeploy the function (Supabase, you)

Do this after step 4, or any time after step 3 has stopped the proxy from calling it. Doing it earlier makes the still-connected domain return the proxy's "Review desk is briefly unavailable" 502.

Dashboard: Edge Functions → `admin-review` → Delete. That is the click that takes the page off production.

CLI, from a checkout already linked to that project. The command deletes the deployed function only. It does not delete the files in git. Official usage is `supabase functions delete <name>` against the linked project (`project_id` in `supabase/config.toml` is `mkegtssedjyqldysvzga`):

```sh
supabase link --project-ref mkegtssedjyqldysvzga
supabase functions delete admin-review
```

Rollback: from a git revision that still contains `supabase/functions/admin-review/`,

```sh
supabase functions deploy admin-review --project-ref mkegtssedjyqldysvzga
```

`config.toml` must still have `verify_jwt = false` for that deploy, or the gateway rejects the page before the password check. If the teardown PR already deleted that block, deploy from the parent commit, or put the block back first.

### 6. Unset the two secrets (Supabase, you)

Nothing else reads them. Do this after the function is deleted, so a rollback deploy in the same hour still has a password.

Dashboard: Project Settings → Edge Functions → Secrets. Remove `ADMIN_PASSWORD` and `ADMIN_TOKEN` only.

CLI, same linked project. Official usage is `supabase secrets unset [NAME] ...`:

```sh
supabase secrets unset ADMIN_PASSWORD ADMIN_TOKEN
```

Rollback: set both secrets again before you expect the login page to accept a password. This repo does not store the values.

### 7. Delete the stale sheet object (Supabase, you)

Storage → bucket `marketing-review` → delete `week.html`. The bucket is private. The weekly batch no longer writes it. Drop the bucket only after you look inside and it has no other objects. Do not delete the public `marketing` bucket (card images).

### 8. Verify (you)

| Check | Pass |
| --- | --- |
| https://linear.app/savblack/project/content-automation-2ce2d56ced11 | Project opens. A `/approve` on a card still only changes article status. |
| https://publish.buffer.com | Queue opens. Nothing in the teardown edits Buffer. |
| Weekly email after the next batch | Buttons are still Linear and Buffer. No admin link. |
| https://theplot.tv and https://app.theplot.tv | Unchanged. |
| https://admin.theplot.tv | Fails closed. Acceptable: DNS does not resolve, or a Cloudflare error for a removed custom domain, or `410` if the domain was not removed yet. Not acceptable: the marketing homepage, the review UI, or a 502 from the proxy. |
| `https://mkegtssedjyqldysvzga.supabase.co/functions/v1/admin-review` | 404 from Supabase after the function delete. A password page here means the undeploy did not happen. |
| Old bookmark | Will not load. That is the point. There is no redirect. |

### What this PR deliberately did not soft-disable

Turning Approve, Reject, and Save into no-ops would be an edit to `supabase/functions/admin-review/index.ts` plus `supabase functions deploy admin-review`. That is a production deploy of the function, which this run must not do, and the page has no test suite. Leave the buttons until step 5. Do not click them. They still re-queue publication rows and, on Reject, skip captions that have not reached Buffer.

## Hosting and deploy pieces that go away

| Piece | Role | When it can go |
| --- | --- | --- |
| Cloudflare Pages custom domain `admin.theplot.tv` on `plot-site` | Every request on that host is routed to the proxy | Cutover step 4, after the 410 code is deployed |
| `apps/website/functions/_middleware.js` host check | Sends that host to `admin()`, plus a disallow-all `robots.txt` | Teardown code PR (step 3), replaced with a 410 |
| `apps/website/functions/_lib/admin.js` | Forwards GET/POST, cookie, and client IP to the Edge Function. Does not forward `?key=` | Same PR, once the middleware no longer imports it |
| `supabase/functions/admin-review` source | The page. `verify_jwt = false` because it does its own password check | Same PR deletes the source. Step 5 undeploys production |
| Secrets `ADMIN_PASSWORD`, `ADMIN_TOKEN` | Login. Only this function reads them | Step 6, after the undeploy |
| Bucket `marketing-review` object `week.html` | Last sheet. The batch no longer uploads it | Step 7 |
| `GH_DISPATCH_TOKEN_CONTENT` | Desk Regenerate and Linear `/generate` / `/regenerate` | Keep it. Linear still uses it. |

The marketing site itself (theplot.tv) stays. Only the admin host on that Pages project goes.

## Risks and rollback

- **Using the desk before step 5 can double-post or suppress a caption.** Approve re-queues failed and skipped rows. Reject skips rows that are still `queued`. Linear does neither. Rejecting an article should leave social posts alone.
- **Deleting the function while the custom domain still points at Pages** serves the proxy's "briefly unavailable" 502. Undeploy after the proxy is gone (step 5 after step 3, ideally after step 4).
- **Removing the host check without a 410** makes `admin.theplot.tv` serve the marketing site. The teardown PR must return 410 first.
- **An old bookmark** stops loading. No redirect is planned. The raw Supabase function URL keeps working until step 5.
- **Rollback** is at each step above. Do not unset secrets in the same hour as a function delete you might want to undo. DNS for a removed custom domain is the slow part.
- **The marketing-week skill** writes the database directly. Deleting the page does not stop it. Phase 1 rewrote `marketing/REVIEW.md` so approve and reject no longer re-queue or skip rows. An agent that ignores the runbook can still do those writes by hand.
- **`/regenerate` and a desk Regenerate** clear copy and start the weekly worker. They do not edit or delete the Buffer post already scheduled. A regenerated caption can sit in the database beside an older Buffer post. That is true today on both surfaces.
- **Pause** never empties Buffer. Retiring the desk does not change that.

## Delta for `docs/ops/gtm-automations.md`

That file is added in PR #1016 and is not on `main`. When it merges, add this section after "Observability today" (or next to the admin-desk bullet in that section):

```markdown
## Admin desk (retiring)

`https://admin.theplot.tv` is still up. It is not where a week is reviewed.
The weekly email links Linear and Buffer. The weekly batch no longer uploads
the week sheet. Approve and reject in
[`marketing/REVIEW.md`](../../marketing/REVIEW.md) change article status only.
Teardown is planned and waiting on a human cutover:
[`docs/ops/retire-admin-review.md`](retire-admin-review.md).

Do not click Approve, Reject, or Save on the desk while it is still up. Those
buttons still change publication rows in ways Linear stopped doing, and a desk
edit of a caption does not update a post Buffer already has.
```

## Decisions already made

- The desk is unused. Do not preserve it as a review surface.
- Rejecting an article leaves social posts alone, including captions that have not reached Buffer yet. Delete those in Buffer if they should not go out.
- Question posts stay Buffer-only. The mirror already skips them.
- No replacement UI.

Still yours to click, not to redesign: steps 4 through 8 above. Merging the teardown code PR (step 3) is the other explicit go, because Pages will deploy it.
