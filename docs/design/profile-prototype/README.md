# PLOT profile prototype

Standalone design prototype, not connected to the app or live data.

From the repository root, run:

```sh
python3 -m http.server 5289 --bind 127.0.0.1
```

Open http://127.0.0.1:5289/docs/design/profile-prototype/ (use another port if occupied).

The prototype reuses existing PLOT artwork and fonts. All identity, counts,
viewing dates and selections are fictional. Follow is a local toggle; sharing
opens a preview; navigation buttons display explanatory messages.

## Reviewed direction

- Minimal copy, optional bio, title artwork and compact actions.
- Top picks, Lists and Watch history.
- View all lists and View all sit beside their section headings.
- View list sits to the right of Sunday films.

## Before implementation

Sparse-profile states are specified but not implemented in this static sample:
hide empty sections and zero counts, omit absent bios and keep fewer picks at
natural sizes. Preserve existing privacy and visibility rules. Pinning picks
and share-image export are proposals, not implemented product features.
