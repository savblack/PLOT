# Illustrated Premium previews (design reference only)

Archived from commit `22f88b3da37962470dd0b724a8470f2c917fdf8e`, designed on 17 September 2026.
These files are reference material, not application modules. They are not imported or shipped.
The current plans page, pricing, entitlements and launch controls remain authoritative.
Do not cherry-pick the old page or use these examples to infer current product availability.

## Concepts worth keeping

- Automatic syncing: Plex and Trakt flow into Plot, with a poster and a watched-history confirmation.
- Collaborative lists: three friends contribute individual titles to a shared film-club list.
- Personal insights: a compact decade-rating chart and a clearly labelled fictional community-rating comparison.
- Smart lists: saved genre/runtime filters, poster matches and an automatically added discovery.

## Archived sources

- `PremiumExample.jsx.txt`: exact rendering component.
- `premiumExamples.js.txt`: exact illustrative copy, poster paths and sample values.
- `PlansPage.css.txt`: original page stylesheet, including the `.plans-demo*`, `.plans-sync*`, `.plans-shared-picks*` and `.plans-insight*` illustration styles. Other page selectors are historical context only.

All data is illustrative. Artwork provenance is recorded in `docs/research/premium-example-evidence.json`.
The source component imports the example catalog from core; adapt that import if recreating a sandbox preview.
The text extensions intentionally keep this archive outside application compilation and linting.
