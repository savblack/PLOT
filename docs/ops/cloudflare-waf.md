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
