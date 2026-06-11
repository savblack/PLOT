# PLOT — Marketing Automation

Fully-automated organic social content for **X, Instagram, and Threads**, plus a
**weekly subscriber newsletter**. One post per day, generated ~12 hours ahead,
previewed to the admin by email (veto window), then published automatically.

## How a post happens

```
11:00 UTC  marketing-generate.yml
           plan.mjs      — evaluate triggers, insert ONE marketing_posts row
           generate.mjs  — Claude copy + Playwright renders + storage upload
                           + veto digest email -> status pending_review
           (a post only becomes publishable once digest_sent_at is set —
            if the digest email failed, nothing publishes: FAIL CLOSED)

…veto window: click the link in the digest to kill a post…

23:30 UTC  marketing-publish.yml      (9:30am AEST / ~6:30pm US ET)
           publish.mjs   — X via Buffer, IG + Threads via direct Meta APIs

13:00 UTC  marketing-metrics.yml      — daily IG/Threads insights -> marketing_metrics
Sun 20:00  marketing-weekly.yml       — performance report + subscriber newsletter
Mon 02:00  marketing-token-refresh.yml — IG/Threads 60-day token refresh (<21d left)
```

## Post types & triggers

| Type | Trigger | Media |
|---|---|---|
| `weekly_slate` | Monday (AEST) | carousel: one card per title, most popular first |
| `trending_chart` | Friday (AEST) | IG/Threads carousel: chart 1-5, chart 6-10, top-3 detail cards; X gets one full top-10 chart |
| `countdown` | tracked title at T-14/T-7/T-1 | single card, big day count |
| `now_streaming` | tracked title's digital date = today | single backdrop card |
| `trailer_drop` | new official trailer on a tracked title | single backdrop card |
| `on_this_day` | 10/20/25/30/50-year anniversary | single card; also the fallback |

## Channel mapping (which render goes where)

Every card renders twice: **portrait 1080×1350** and **landscape 1600×900**.

| Channel | Gets | Carousel? |
|---|---|---|
| **Instagram** | all portrait cards, in order | yes — native carousel (cover first) |
| **Threads** | all landscape cards, in order | yes — native carousel |
| **X** | exactly ONE landscape image — card 0 (`xCardIndex` in post-types.mjs overrides if ever needed) | no — X renders multi-image as a collage grid, so we never send more than one; the X copy carries what the other cards said (e.g. "Also this week: …") |
| **Email digest** | the top slate card (portrait) embedded in Sunday's newsletter, plus text lists | n/a |
| **What's On** (theplot.tv/whats-on) | the canonical article: `copy.page_title` + `copy.page_body` + the hero card, server-rendered with OG tags | n/a |

## The "What's On" feed

Every post is originally published as an article on **theplot.tv/whats-on**
(the `marketing-feed` edge function, proxied via `website/vercel.json`
rewrites). The generate step writes a `slug` and Claude produces
`page_title`/`page_body` alongside the social copy. Entries become visible at
their scheduled publish time and vetoed posts never appear, so there's nothing
extra to manage. Threads posts automatically append the article link
(UTM-tagged); X and Instagram point to it via link-in-bio. The veto digest
includes each post's article URL for preview.

Deploy: `supabase functions deploy marketing-feed --no-verify-jwt`. The
`/whats-on` rewrite only works on the Vercel project that serves theplot.tv —
if the site is hosted elsewhere, replicate the two rewrites from
`website/vercel.json` there.

Non-anchored-day priority: T-1 → now streaming → trailer → T-7 → T-14 → on this
day. `marketing_tracked_titles` (top ~25 upcoming by TMDB popularity) carries
the announced/known-trailer state so nothing is announced twice. `topic_key`
is unique — re-running the planner is always a no-op.

## Voice & CTAs

`VOICE.md` is injected into every copy-generation call. CTA variants are stored
per post (`copy.cta_variant`) and broken out in the weekly report so we learn
which CTAs work. X copy never contains URLs (enforced twice: prompt + regex in
the publishers).

## Costs

$0/month by design. IG + Threads APIs are free. X goes through Buffer's free
plan (Buffer absorbs X's pay-per-use API costs; limits: 100 req/24h — we use ~3).
Tradeoff: no X post analytics (Buffer's analytics API isn't shipped; X direct
reads are paid) — the learning loop runs on IG/Threads metrics.

## One-time setup

1. **Apply the migration + deploy functions**
   ```sh
   supabase db push
   supabase functions deploy marketing-veto --no-verify-jwt
   supabase functions deploy newsletter-subscribe --no-verify-jwt
   supabase functions deploy marketing-feed --no-verify-jwt
   ```
2. **Buffer (X)**: free account at buffer.com, connect the PLOT X account,
   create a personal API key (Settings → API) → GH secret `BUFFER_API_KEY`.
3. **Instagram**: convert the PLOT IG account to Professional. In the Meta dev
   portal create an app, add the **Instagram** product (Instagram Login) with
   `instagram_business_basic`, `instagram_business_content_publish`,
   `instagram_business_manage_insights`. Dev mode is fine (own account only).
   Then: `node marketing/setup/exchange-tokens.mjs instagram` (see file header).
4. **Threads**: add the Threads use case to the same app
   (`threads_basic`, `threads_content_publish`, `threads_manage_insights`),
   then `node marketing/setup/exchange-tokens.mjs threads`.
5. **GitHub secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `TMDB_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`,
   `MARKETING_ADMIN_EMAIL`, `BUFFER_API_KEY` (optional `BUFFER_CHANNEL_ID`).
6. **Profile bios** (all three platforms): add
   *"This product uses the TMDB API but is not endorsed or certified by TMDB."*
   and a link to theplot.tv.

## Day-to-day operations

- **Preview templates** (no DB needed): `TMDB_API_KEY=... npm run mkt:preview`,
  then open `marketing/preview/out/index.html`. Run after any template change.
- **Dry run a publish**: dispatch *Marketing — publish* with `dry_run` checked,
  or locally `DRY_RUN=1 npm run mkt:publish`.
- **Missed/failed digest**: nothing publishes (fail closed). Re-dispatch
  *Marketing — generate* from the Actions tab — it reuses already-generated
  media and just re-sends the digest.
- **Retry a failed platform**: dispatch *Marketing — publish* with
  `retry_failed` checked.
- **Kill a post**: click *Veto this post* in the digest email any time before
  23:30 UTC.
- All five workflows email `MARKETING_ADMIN_EMAIL` on failure.

## TMDB usage guardrails

Images are downloaded and composited into branded cards (never hotlinked).
The cards themselves carry no attribution text — the required TMDB notice
("This product uses the TMDB API but is not endorsed or certified by TMDB.")
lives in the website footer and all three profile bios, so keeping those in
place matters. Copy is informational/editorial only and must never imply
studio endorsement (see VOICE.md). If a rights holder objects to a post,
veto/delete it and add the title to a skip list in the planner.
