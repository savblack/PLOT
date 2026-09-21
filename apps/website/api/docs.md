# PLOT public API

PLOT is a film and television companion for tracking what you watch. Almost all of
it lives behind a member's own account. This page covers the small part that
theplot.tv serves to anyone, with no account and no key.

Machine-readable description: [/api/openapi.json](https://theplot.tv/api/openapi.json)
(OpenAPI 3.1). Catalog entry: [/.well-known/api-catalog](https://theplot.tv/.well-known/api-catalog)
(RFC 9727).

## What is not here

There is no public API for member data. Watch history, watchlists, ratings,
private notes, custom lists and account details are reachable only through an
authenticated session in the PLOT app. No endpoint below returns any of it, and
no agent should imply it has access to a member's account without that member's
explicit, authenticated permission.

## Endpoints

### POST /api/newsletter

Subscribes an email address to the weekly PLOT digest.

```
POST https://theplot.tv/api/newsletter
Content-Type: application/json

{"email": "you@example.com"}
```

Returns `{"ok": true}`. The response is the same whether or not the address was
already subscribed, so it cannot be used to find out who has an account.

Send `{"list": "mobile-app"}` to join the mobile app launch waitlist instead of
the digest. Joining the waitlist is consent to hear about the launch, not to
receive the weekly digest.

Signups are rate limited per IP address. Over the limit the endpoint returns
`429` with a `Retry-After` header. Subscribe only an address you own, or one
whose owner asked you to subscribe it.

### GET or POST /api/newsletter?action=unsubscribe&token=...

Ends a subscription. The token comes from the unsubscribe link in a PLOT email,
so there is no way to unsubscribe an address you do not have a link for. `GET`
returns a confirmation page; `POST` performs the unsubscribe, which is also how
one-click unsubscribe from an email client works.

### GET /api/health

```
{"status": "pass", "description": "PLOT public API"}
```

Served as `application/health+json`. It reports whether theplot.tv is serving
this API and makes no calls of its own, so it answers for this host only and
never for the systems behind it.

## Terms

These endpoints exist to run theplot.tv. They are not a product, they carry no
uptime commitment, and their shape can change. Anything that matters to you
belongs behind your own check rather than an assumption that this page stays
true. If you are building something that needs more than this, say hello through
[the About page](https://theplot.tv/about).
