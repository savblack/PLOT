# International broadcast Guide

Production integration is now prepared in [production-rollout.md](production-rollout.md).
The preview notes below document the earlier implementation.

Implemented in the local development preview, 16 September 2026. This does not deploy
or replace the authenticated production Guide, change user profiles, or add a subscription.

## Coverage

| Market | Source | Verified import | Scope |
| --- | --- | --- | --- |
| Australian capitals | Matt Huisman | Sydney, Melbourne, Perth previously verified | Provisional numbered broadcast services |
| New Zealand | Matt Huisman | 22 channels, 5,115 programmes | National numbered TV services; Auckland display timezone |
| New York | TV Passport | 5 channels, 464 programmes | WABC, WCBS, WNBC, WNYW, WNET |
| Los Angeles | TV Passport | 4 channels, 372 programmes | KABC, KCBS, KNBC, KTTV |
| Chicago | TV Passport | 5 channels, 448 programmes | WLS, WBBM, WMAQ, WFLD, WTTW |
| Toronto | TV Passport | 4 channels, 366 programmes | CBLT, CFTO, CITY, CIII-DT-41 |
| London | Freeview | HTTP 403 | Adapter wired, no usable live listings verified |

Counts are one snapshot, not availability or accuracy guarantees. US/Canadian lineups
are deliberately labelled starter selections, not complete antenna or national lineups.
London is explicitly marked unavailable. Other areas can be saved without substituting
another market's schedule. National NZ listings are not a postcode reception guarantee.

## User flow

Settings → Country → TV market → Save region → Back to Guide. Guide retains only the
small market/Change link. Region and channel choices remain device-local in this preview.
Channel selections are keyed by market ID and do not carry across countries. The date
strip shows seven days for Matt's feeds and two days for station sources. Overnight rows
include a date when the start or end falls outside the selected day. Channels missing
listings on a selected date are counted separately from an empty search result.

## Source provenance

- Matt's NZ directory: https://i.mjh.nz/nz/ (`tv.json`, `epg.xml.gz`).
- US/Canadian station IDs and names were resolved from:
  https://github.com/iptv-org/epg/blob/master/sites/tvpassport.com/tvpassport.com.channels.xml
- Station HTML format and timezone selector checked against live station pages and:
  https://github.com/iptv-org/epg/blob/master/sites/tvpassport.com/tvpassport.com.config.js
- London network and service IDs resolved from:
  https://github.com/iptv-org/epg/blob/master/sites/freeview.co.uk/freeview.co.uk.channels.xml
- Freeview API response shape referenced from:
  https://github.com/iptv-org/epg/blob/master/sites/freeview.co.uk/freeview.co.uk.config.js

The two new sources are public endpoints, not contracted APIs. No paid service or API
key was added. Explicit reuse terms have not been verified; successful fetches and the
collector project's code licence are not evidence of data redistribution permission.
Source attribution is visible. Source HTML/XML and generated schedules stay out of git.

## Import and failure behaviour

`broadcastMarkets.json` is the shared market catalog consumed by core and Python. UI,
endpoint allowlist, station IDs, timezone, source choice and requested horizon derive
from this file. To add a market, resolve actual station IDs first; do not guess them.

Run `python3 scripts/guide/import-feed.py US-NewYork` (or another catalog ID), or let the
Vite adapter import on first use. Downloads refresh after six hours. Concurrent requests
within the server share one import; failed attempts have a one-minute cooldown. A full
validated snapshot replaces the prior file atomically. Failure keeps the previous file.
This is local on-demand caching, not production scheduled refresh infrastructure.

TV Passport supplies wall-clock times and an explicit page timezone. The parser converts
those to UTC, rejects missing timezone information, and refuses ambiguous DST times.
Yesterday is requested to cover 00:00–06:00 carryover; when the source no longer serves
that date, it is skipped without changing any timestamps. Wrong dates for today/tomorrow,
missing current station schedules and conflicting duplicate slots fail the refresh.

XMLTV accepts the standard external `xmltv.dtd` declaration without loading the DTD.
Other DTD/entity declarations are rejected. Compressed and expanded download sizes are
bounded. Freeview errors are surfaced without bypassing access controls or inventing
listings. No station scraping is done by the browser itself.

## Verification

- `npm run check`: lint + build pass, existing warnings only.
- `npm run test:unit`: 308 web and 533 core tests pass.
- `python3 -m unittest discover -s scripts/guide -p 'test_*.py'`: five tests pass.
- `node scripts/check-hardcoded-copy.mjs`, `node scripts/check-core-imports.mjs`,
  `git diff --check`: pass.
- Live import results are listed above. UK fetch fails with 403 and remains unavailable.
- Browser checked country/market save, local timezone labels, real US/NZ listings and
  unsupported-area state. Production/authenticated-shell and native testing remain pending.

## Remaining work

- A working UK feed and verified regional service mapping.
- Additional markets, subchannels and verified reception-area lineups.
- Production durable storage/scheduled refreshes and per-channel health monitoring.
- Account persistence, the real Settings/Guide routes, Calendar reminders and native parity.
- No commits, deployment, production migration or external contact performed.

Final browser checks also passed for Los Angeles and Toronto timezone labels, the UK
unavailable state, and a 390px phone viewport with no horizontal overflow. The preview
was left on New York for review. Five Python importer tests pass, including preservation
of the previous cache file after a failed refresh.
