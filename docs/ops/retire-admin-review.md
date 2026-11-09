# Retire the admin desk

Articles are reviewed in Notion (What's On Articles). Social posts are reviewed in Buffer. The hosted
desk at `admin.theplot.tv` (`supabase/functions/admin-review`) is retired.

**Status:** retired in production (2026-09-22). Code on `main` (#1018). Cutover
below is done.

`docs/ops/operator-desk-shelved.md` is a different thing: an unmerged React
replacement from July 2026. Do not revive it.

## What already works without the desk

1. `marketing-weekly-batch.yml` plans the week, writes copy, renders cards, and pushes social posts into Buffer.
2. `marketing-notion-mirror` opens one Notion page per website article on What's On Articles.
3. Status and comments on that page apply `/approve`, `/reject`, `/copy`, and the other slash commands.
4. Buffer holds captions as drafts and sends the ones you approve there.
5. `marketing-publish.yml` reconciles Buffer and tops the queue up.
6. `/pause` stops **new** posts entering Buffer. Drafts already there send only if approved in Buffer.

Rejecting an article leaves social posts alone. That is deliberate.

## Done in code (#1018)

- `apps/website/functions/_middleware.js` returns `410` for `admin.theplot.tv` (robots.txt still disallow-all).
- Deleted `apps/website/functions/_lib/admin.js` (the proxy).
- Deleted `supabase/functions/admin-review/` and the `[functions.admin-review]` block in `supabase/config.toml`.
- Operator docs and `docs/ops/gtm-automations.md` no longer treat the desk as a review surface.
- `AGENTS.md` points here instead of suggesting a richer desk.

## Production cutover (done)

| Step | Result |
| --- | --- |
| Pages `410` on `admin.theplot.tv` | Confirmed after merge |
| Remove custom domain from `plot-site` | Removed; project domains are `plot-site.pages.dev` + `theplot.tv` only |
| `supabase functions delete admin-review` | Gone (`…/functions/v1/admin-review` → 404) |
| `supabase secrets unset ADMIN_PASSWORD ADMIN_TOKEN` | Unset |
| Delete Storage `marketing-review/week.html` | Deleted (bucket kept) |
| Zone DNS `admin` record | None present in the `theplot.tv` zone API (no record to delete) |

After the Pages domain was removed, `admin.theplot.tv` may still answer with a
Cloudflare error (e.g. 522) until any residual edge mapping clears. That is
fail-closed: not the desk, not the marketing homepage.

Rollback would need: re-add the custom domain on `plot-site`, git revert of the
teardown, and `supabase functions deploy admin-review` from a revision that
still has the source, plus re-set the two secrets.

### Smoke (re-check anytime)

| Check | Pass |
| --- | --- |
| Private Notion review database | Verify one page and one approval after cutover |
| Buffer | Queue opens |
| Weekly email after next batch | Verify Notion + Buffer links after cutover |
| theplot.tv / app.theplot.tv | Unchanged |
| admin.theplot.tv | DNS fail, Cloudflare error, or 410. Not homepage / desk / 502 |
| `…/functions/v1/admin-review` | 404 |

## Do not drop

- `auth_fail_attempts` (signup-bypass and media-sync use it)
- `marketing_review_events`, `marketing_posts`, `marketing_settings`
- empty `operator_*` tables (`docs/ops/operator-desk-shelved.md`)
- `GH_DISPATCH_TOKEN_CONTENT` (Notion `/generate` and `/regenerate`)

## History (why this existed)

The desk was a password-gated HTML control room that could approve/reject and also
rewrite publication rows (re-queue on approve, skip captions on reject). The old review board mirrored it, then the Buffer split made article review separate. Using the desk
after that could double-post or suppress captions. Phase 1 stopped the docs and
email from sending people there. This teardown removes the host and the function
source; production undeploy closes the raw function URL.
