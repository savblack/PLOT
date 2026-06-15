# Acquisition dashboard & weekly SEO cadence

Lightweight, operational acquisition reporting for theplot.tv. Lives primarily
in **PostHog** (same project as the app, token `phc_oo5…`), with Search Console
/ Bing as complementary indexing inputs. Covers Linear **SUS-116** (dashboard +
cadence) and the verification half of **SUS-114** (search consoles).

## What's already wired (in code)

- **PostHog** loads on every marketing page via `website/js/config.js` —
  pageviews + autocapture on, `cross_subdomain_cookie: true` so the anonymous id
  carries from `theplot.tv` to `app.theplot.tv` (one funnel across the hop).
- **UTM / referrer forwarding** (`config.js`): `utm_*`, `gclid`, `fbclid`,
  `msclkid`, `ref` and the originating referrer host are appended to every
  `app.theplot.tv` signup/login link, so attribution survives into signup.
- **robots.txt** + **sitemap.xml** shipped at the site root for the consoles.

## PostHog dashboard — recommended tiles

Create one dashboard, "PLOT — Acquisition".

1. **Funnel** (core): `landing pageview` → `signup CTA click` → `signup start`
   → `signup complete`.
   - Landing pageview = PostHog `$pageview` on `theplot.tv`.
   - CTA click = autocapture click on the signup links (filter
     `$event_type = click` and element `href` contains `app.theplot.tv/signup`),
     or add a custom `signup_cta_clicked` event later if you want it explicit.
   - signup start / signup complete = events emitted by the app on
     `app.theplot.tv` (already the same PostHog project).
2. **Breakdown** of the funnel by: `utm_source`, `utm_medium`, `utm_campaign`,
   `$referring_domain`, and device type (`$device_type`).
3. **Trends**: daily CTA click-through rate and daily signup completion rate.
4. **Session replays**: saved filter for users who clicked the CTA but did NOT
   reach `signup start`/`signup complete` — to see where they drop.
5. **Web vitals / page performance** for the landing page (PostHog web vitals
   autocapture) — watch only if site speed looks conversion-relevant.

Keep it to these tiles; this is operational reporting, not a BI project.

## Weekly SEO / acquisition cadence (~15 min)

- PostHog: glance at the funnel + trends; note any week-over-week drop in CTA
  CTR or signup completion, and the top `utm_source`/referrers.
- Search Console: check Performance (clicks/impressions/CTR/position) and
  Coverage/Indexing for new errors.
- Bing Webmaster: same quick check.
- If a step regressed, pull 2–3 session replays for that segment.

## SUS-114 — search console verification (your accounts, one-time)

Code side is done (robots.txt, sitemap.xml, canonical, metadata). To finish:

1. **Google Search Console** → add property `https://theplot.tv` → verify via
   the DNS TXT record (Cloudflare) or by uploading the HTML verification file to
   `website/` (it deploys at the site root). Then submit
   `https://theplot.tv/sitemap.xml`.
2. **Bing Webmaster Tools** → add the site → either import from Search Console
   (fastest) or verify via DNS/meta tag → submit the same sitemap.
3. Confirm `https://theplot.tv/robots.txt` and `/sitemap.xml` return 200 in each
   console's tester, and that the homepage is indexable (no stray `noindex`).
