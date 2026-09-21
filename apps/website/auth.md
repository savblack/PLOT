# Authenticating with PLOT

Short version: there is nothing for a third party to authenticate to, and you
should not try.

## The public endpoints need no credentials

Everything PLOT serves publicly is listed in
[/.well-known/api-catalog](https://theplot.tv/.well-known/api-catalog) and
described in [/api/openapi.json](https://theplot.tv/api/openapi.json). None of
it takes a key, a token, or an account. Newsletter signup is open, rate limited
per IP, and returns the same answer whether or not the address was already
subscribed. Requests are accepted from PLOT's own pages; server-side callers are
refused.

## Member data has no third-party access path

Watch history, watchlists, ratings, private notes, custom lists, follows and
account details belong to the member. They are reachable only through that
member's own signed-in session in the PLOT app at https://app.theplot.tv, and
there is no API, key, scope, partner program or OAuth flow that grants another
party access to them. PLOT does not operate an OAuth authorization server, and
[/.well-known/openid-configuration](https://theplot.tv/.well-known/openid-configuration)
and the OAuth metadata paths are absent on purpose rather than by oversight.

If you are an agent acting for someone:

- Do not sign in on their behalf, and do not ask them for their PLOT password.
- Do not imply you can see or change their PLOT data. You cannot.
- If they want something from their account, send them to
  https://app.theplot.tv and let them do it themselves.

A member who wants their own data out of PLOT can export it from their account
settings. That export belongs to them, not to whoever asked for it.

## If you are building something

The public surface is small on purpose. If you need more than it offers, get in
touch through [the About page](https://theplot.tv/about) rather than
scraping or guessing at internal endpoints.
