# Cloudflare WAF rules that the code assumes exist

These live in the Cloudflare dashboard (Security → WAF → Rate limiting rules),
not in the repo, so this file is the only record of them. Check it when
auditing the zone.

## theplot.tv `/api/newsletter` (added 2026-10-14)

`apps/website/functions/api/newsletter.js` proxies to the `newsletter-subscribe`
Edge Function, which has its own DB-backed per-IP (10/h) and global (300/h)
limits. Those cap the damage; a WAF rule stops the traffic at the edge before it
costs Function invocations at all, and was the 2026-10-13 review's ask.

| Field | Value |
|---|---|
| Rule name | `newsletter subscribe` |
| Expression | `(http.host eq "theplot.tv" and http.request.uri.path eq "/api/newsletter" and http.request.method eq "POST")` |
| Characteristics | IP |
| Period | 1 minute |
| Requests | 5 |
| Action | Block |
| Duration | 10 minutes |

A real visitor submits the form once; five a minute from one address is a
script.

## `app.theplot.tv/save` rotating-proxy traffic (2026-10-13)

The app's zone-level WAF rate-limiting rule covers `/save` along with `/u/*`
and `/list/*` (see `apps/web/wrangler.toml`). Keep it in place. It limits each
IP, so a crawler rotating proxies can still generate many requests and PostHog
persons. The rule and its current thresholds live in Cloudflare, not this repo;
this document does not verify their live state.

`/save` is a public share-link and signup entry point. Its Pages Function
(`functions/save.js`) fetches title metadata for social cards and the logged-out
preview, then serves the SPA. `loadTitle()` skips invalid IDs, and the response
sets `noindex, nofollow`. There is no app-side request challenge. Turnstile is
on the auth form, not on `/save`. `SavePage.jsx` normally reuses the
server-fetched title, avoiding a second lookup.

The web app drops PostHog events only while the incident's exact direct
`/save` fingerprint matches. A visitor who continues to signup is still
measured. This reduces future event pollution; it does not remove historical
events, block HTTP requests, or reduce server-side title lookups. PostHog's
session recording and other SDK requests are separate from this event filter.

If request or lookup volume remains costly, review Cloudflare request samples
and the WAF rule's live counters. Evaluate a `/save`-scoped rule for
high-confidence automation against those samples before trying a managed
challenge. Check that legitimate direct share links, social unfurls, and the
route's signup CTA still work before enforcing it. An app-side Turnstile gate
would run after the Pages Function's lookup and could block legitimate visitors
or unfurls, so do not add one without a separate design and impact test. Leave
the existing per-IP rule intact.
