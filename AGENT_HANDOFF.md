# search-traffic-drop

Status: paused (findings written; waiting on a Search Console look)
Branch: agent/2026-11-09-search-traffic-drop (from origin/main)
Worktree: ~/Developer/PLOT-worktrees/2026-11-09-search-traffic-drop
Owner: Alix (SEO and traffic to signup)
Updated: 2026-11-10

## In plain words

Google visits did not "break". Most of the extra visits in mid-October came from a
handful of new movies that were in cinemas then (for example "You Can See
Everything" and the new "Sense and Sensibility"). People googled them, landed on
Plot's page for that movie, and stopped once the buzz faded. Take those few movies
out and Google visits are flat: about 136, 155, 136 and 132 a week from Oct 12 to
Nov 8. The About and Pricing rewrites are not the cause: almost nobody arrives on
those pages from Google, before or after. The site is not hiding itself from
Google (no blocking tags, sitemaps work), and Google has not announced a big
ranking change since May.

The one real dip worth a second look is people landing on the homepage from Google
(roughly 34 a week down to 20). That is usually people searching for "Plot" by
name. The numbers are small, so Search Console is needed to tell whether it is
real.

Savannah: nothing to fix on the site yet. One 10-minute job is still open: sign in
to Google Search Console so an agent can read it (details under "Next").

## Evidence

### 1. PostHog (project "PLOT", id 471234, confirmed with project-get)

Headline: approved catalog metric `acquisition_channels` (approved by Savannah on
Oct 15, 2026), 2026-09-14 to 2026-11-09, theplot.tv, engaged visitors only:
Organic Search 915 sessions, Direct 472, Organic Social 27, AI 23, Referral 11.
That chart shows totals only, so the weekly split below is a one-off query.

One-off breakdown (not a saved definition): sessions on theplot.tv whose channel is
"Organic Search", bots excluded (`$virt_is_bot = false`), grouped by the session's
first page (`session.$entry_pathname`) and by week (Mon start, Sydney time). It
does not use the "engaged" cohort, because a search visitor who bounces still
counts for SEO. Numbers are lower than the table in the old handoff because that
one included app.theplot.tv.

| Week of | Total | Homepage | /movie/ | /tv/ | Other | Distinct movie pages | 7 spike titles |
|---|---|---|---|---|---|---|---|
| Sep 14 | 63 | 23 | 23 | 5 | 12 | 17 | 0 |
| Sep 21 | 91 | 29 | 38 | 15 | 9 | 34 | 0 |
| Sep 28 | 118 | 31 | 67 | 12 | 8 | 52 | 2 |
| Oct 5 | 142 | 20 | 87 | 23 | 12 | 53 | 10 |
| Oct 12 | 184 | 36 | 128 | 11 | 9 | 75 | 48 |
| Oct 19 | 209 | 34 | 155 | 11 | 9 | 86 | 54 |
| Oct 26 | 142 | 21 | 98 | 12 | 11 | 73 | 6 |
| Nov 2 | 136 | 19 | 98 | 13 | 6 | 81 | 4 |
| Nov 9 (partial) | 24 | 7 | 14 | 2 | 1 | 12 | 1 |

"7 spike titles" are the pages that jumped and fell back:
`/movie/you-can-see-everything-1765072` (weekly from Oct 5: 1, 20, 22, 0, 2),
`/movie/sense-and-sensibility-1503762` (peak 17 in Oct 19 week),
`/movie/street-fighter-1153576` (6), `/movie/kung-fu-soccer-1491920` (6),
`/movie/the-social-reckoning-1281331` (6), `/movie/whalefall-1255833` (4),
`/movie/la-bola-negra-1422041` (6). Live pages for the first two say "showing in
cinemas", which fits a release-week search spike.

Read-outs:
- Without the spike titles: Oct 12 136, Oct 19 155, Oct 26 136, Nov 2 132. Flat.
- Breadth still growing: distinct movie pages getting Google visits went 17, 34, 52,
  53, 75, 86, 73, 81. Google is sending visitors to more title pages, not fewer.
- "Other" (About, Pricing, What's On, community, etc.) is 6 to 12 a week throughout.
  The About rewrite (#1309, Oct 17) and pricing rebuild (#1321, Oct 15) did not lose
  measurable search traffic.
- Homepage from Google: ~29-36 a week Sep 21 to Oct 19 (except 20 in Oct 5 week),
  then 21, 19. Small numbers; possible branded-search dip, unconfirmed.
- Caveat: these one-off queries did not apply the project's test-account filters
  (bots were excluded). Internal visits from Google are unlikely to matter here.

### 2. Live site and git history (checked 2026-11-10 with a Googlebot user agent)

- Title pages (the three above), `/`, `/about`, `/pricing`: all HTTP 200, a
  self-pointing canonical, no `noindex` meta and no `X-Robots-Tag` header.
- `robots.txt`: allows everything except `/api/` and `/cdn-cgi/`; lists all three
  sitemaps. Last changed in #1298 (Oct 13) to add those two disallows. Fine.
- `sitemap.xml` 10 URLs, `sitemap-titles.xml` 23,996 URLs, `sitemap-articles.xml`
  264 URLs. All 200. `/plans` 301s to `/pricing` (from #1298).
- Title-page code changes in the window were all Oct 4-16 (#1179, #1223, #1298,
  #1304, #1324, #1335, #1379): caching, egress, OG images, a canonical 301 for
  mismatched slugs. All landed before the Oct 19 peak, so they did not cause the
  fall. No title-page change after Oct 16.
- Homepage changes after the peak: #1441 (Oct 27, eyebrows/CTAs), #1464 (Nov 7,
  icons), #1466 (Nov 9, new hero). Title, description and canonical are unchanged
  and healthy. Unlikely to move rankings this fast, but they line up in time with
  the homepage dip, so check them in Search Console.

Small copy issues spotted (not traffic causes; for Alix):
- About meta description says "Premium from US$2/month"; Pricing says "$3 a month".
  One of them is wrong.
- Pricing meta description starts "plot is free"; prose should be "Plot".

### 3. Outside causes

- Google Search Status Dashboard (as reported by web search, 2026-11-10): no core
  update since the May 2026 one (finished June 2). The latest ranking update is a
  spam update that ran Sep 24 to Oct 8. Our numbers rose through that window, so it
  did not hurt us. No announced change in late October.
- The movie-release pattern above is the main outside cause: searches for new
  cinema releases peak in their release weeks and then fall.

## Next (exact action)

1. Savannah or Alix signs in to Google Search Console for theplot.tv (or connects
   it), then an agent reads, for 2026-09-14 to today, compared with the previous
   period:
   - Performance > Search results, by Page: confirm the drop is the spike titles
     above, and check `/` for clicks, impressions and average position.
   - Same report, by Query, filtered to queries containing "plot": is branded search
     ("plot app", "theplot") down, and did position change after Oct 27?
   - Pages (indexing): indexed count trend and any rise in "Crawled, currently not
     indexed", "Duplicate without user-selected canonical", or "Page with redirect".
   - Sitemaps: all three read as Success, with discovered URL counts close to the
     numbers above.
   - Manual actions and Security issues: should be empty.
2. If Search Console agrees, close this as "no site fix needed" and hand Alix the
   real lever: title pages for new and upcoming releases ranking each week (the
   spike shows those pages can win searches).
3. If branded homepage search fell after Oct 27, look again at #1441/#1466 before
   proposing any change. Ask Savannah before building anything.

## Still unknown

- Whether the homepage dip is real or noise (needs Search Console).
- Clicks vs impressions vs ranking position for any page (PostHog cannot see these).
- Whether the US copy is what Googlebot indexes (my check ran from an Australian
  network and got "in Australia"; Googlebot mostly crawls from the US).

## Approvals

- Given: read-only investigation.
- Still needed: any site change; Search Console sign-in (Savannah or Alix).

## Checks

No code changed. No PR. Handoff committed as a `[skip ci]` checkpoint.
