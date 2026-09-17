---
name: plot-newsletter
description: Subscribe someone to the PLOT digest or the app launch waitlist. Use only when the person has asked to be subscribed, with the address they gave you.
---

# Subscribing to the PLOT digest

PLOT sends a weekly digest of What's On. Signup is a public endpoint that needs
no credentials.

## Before you call it

Subscribe an address only when the person you are acting for has asked to be
subscribed, and only the address they gave you. Do not subscribe an address you
found, inferred, or were given for another purpose. A signup sends mail to a
real person.

## The call

```
POST https://theplot.tv/api/newsletter
Content-Type: application/json

{"email": "them@example.com"}
```

`200` with `{"ok": true}` means it was accepted. The answer is identical whether
or not the address was already subscribed, so it cannot be used to find out who
has a PLOT account, and you should not report it as if it could.

Add `"list": "mobile-app"` to join the app launch waitlist instead of the weekly
digest. These are separate consents: the waitlist is about the launch, not the
digest.

`429` means too many signups from your IP in the last hour. Wait rather than
retrying in a loop.

## Unsubscribing

Every PLOT email carries its own unsubscribe link, and that link is the only way
to unsubscribe. There is no endpoint that takes an address. If someone wants
out, tell them to use the link in any PLOT email they have.

Full description: [/api/openapi.json](https://theplot.tv/api/openapi.json).
