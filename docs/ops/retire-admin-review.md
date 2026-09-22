# Retire the admin desk

Articles are reviewed in Linear. Social posts are reviewed in Buffer. The hosted
desk at `admin.theplot.tv` (`supabase/functions/admin-review`) is retired.

**Status:** teardown code is in this change. Merging deploys a `410 Gone` on
`admin.theplot.tv` via the marketing site Pages project (`plot-site`). The live
Edge Function, custom domain, secrets, and stale `week.html` still need the
human steps below after Pages is green.

`docs/ops/operator-desk-shelved.md` is a different thing: an unmerged React
replacement from July 2026. Do not revive it.

## What already works without the desk

1. `marketing-weekly-batch.yml` plans the week, writes copy, renders cards, and pushes social posts into Buffer.
2. `marketing-linear-mirror` opens one Linear card per website article (team PLO, project Content Automation).
3. `marketing-linear-sync` applies `/approve`, `/reject`, `/copy`, and the other slash commands.
4. Buffer holds captions and sends them.
5. `marketing-publish.yml` reconciles Buffer and tops the queue up.
6. `/pause` stops **new** posts entering Buffer. Posts already there still go out until deleted in Buffer.

Rejecting an article leaves social posts alone. That is deliberate.

## Done in code (this PR)

- `apps/website/functions/_middleware.js` returns `410` for `admin.theplot.tv` (robots.txt still disallow-all).
- Deleted `apps/website/functions/_lib/admin.js` (the proxy).
- Deleted `supabase/functions/admin-review/` and the `[functions.admin-review]` block in `supabase/config.toml`.
- Operator docs and `docs/ops/gtm-automations.md` no longer treat the desk as a review surface.
- `AGENTS.md` points here instead of suggesting a richer desk.

## Remaining human cutover (after this PR merges)

Order matters. Pages must ship the 410 before you remove the domain. Undeploy the function after the proxy no longer calls it.

### 1. Confirm the 410

Wait for the `plot-site` Cloudflare Pages deploy on `main`. Then open
`https://admin.theplot.tv/`. Expect status `410` and body `This page has been removed.`
Not the marketing homepage, not the review UI, not a 502.

### 2. Remove the custom domain (Cloudflare)

Project: `plot-site` (theplot.tv). Not `plot` (app.theplot.tv).

1. Workers & Pages → `plot-site` → Custom domains → `admin.theplot.tv` → Remove domain.
2. Zone `theplot.tv` → DNS → delete an `admin` CNAME/A/AAAA if one remains.
3. Do not remove `theplot.tv` or `app.theplot.tv`.

Rollback: re-add the custom domain on `plot-site`. With this code deployed you get
the 410 again, not the desk. Restoring the desk also needs a git revert and
`supabase functions deploy admin-review` from a revision that still has the source.

### 3. Undeploy the function (Supabase)

Project ref `mkegtssedjyqldysvzga`.

Dashboard: Edge Functions → `admin-review` → Delete.

```sh
supabase link --project-ref mkegtssedjyqldysvzga
supabase functions delete admin-review
```

That deletes the deployed function only. Git already dropped the source.

### 4. Unset secrets (Supabase)

After the function is gone:

```sh
supabase secrets unset ADMIN_PASSWORD ADMIN_TOKEN
```

Or Project Settings → Edge Functions → Secrets → remove those two only.

### 5. Delete the stale sheet object (Supabase)

Storage → bucket `marketing-review` → delete `week.html`. Drop the bucket only if
it is empty afterward. Do not touch the public `marketing` bucket (card images).

### 6. Verify

| Check | Pass |
| --- | --- |
| Linear Content Automation | Opens; `/approve` only changes article status |
| Buffer | Queue opens |
| Weekly email after next batch | Linear + Buffer buttons only |
| theplot.tv / app.theplot.tv | Unchanged |
| admin.theplot.tv | DNS fail, Cloudflare error, or 410. Not homepage / desk / 502 |
| `…/functions/v1/admin-review` | 404 after undeploy |

## Do not drop

- `auth_fail_attempts` (signup-bypass and media-sync use it)
- `marketing_review_events`, `marketing_posts`, `marketing_settings`
- empty `operator_*` tables (`docs/ops/operator-desk-shelved.md`)
- `GH_DISPATCH_TOKEN_CONTENT` (Linear `/generate` and `/regenerate`)

## History (why this existed)

The desk was a password-gated HTML control room that could approve/reject and also
rewrite publication rows (re-queue on approve, skip captions on reject). Linear was
built to mirror it, then the Buffer split made Linear article-only. Using the desk
after that could double-post or suppress captions. Phase 1 stopped the docs and
email from sending people there. This teardown removes the host and the function
source; production undeploy closes the raw function URL.
