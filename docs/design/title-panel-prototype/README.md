# PLOT title detail panel prototype

Standalone design prototype of the redesigned title detail panel
(`apps/web/src/components/MediaPanel.jsx`). Not connected to the app or live data.

From the repository root, run:

```sh
python3 -m http.server 5291 --bind 127.0.0.1
```

Open http://127.0.0.1:5291/docs/design/title-panel-prototype/ (use another port if occupied).

Artwork is existing PLOT hero imagery standing in for the real poster and backdrop;
provider logos are the TMDB ones the app already renders. Scores, offers, watch dates
and review text are fictional. Where to watch and the foot bar are the only working
controls; everything else is static.

## Reviewed direction — Option A

Chosen 17 Sep 2026 from three options on the design canvas
(https://claude.ai/artifact/5jwXt5TadiQuqL4BYN3eiM), which also holds the B and C
options, the mid-watch series state, the panel docked at 1440, and the foot bar in
all four of its states.

- **Head.** The backdrop is a 168px band, not a full 16:9 hero; the poster overlaps it
  and the kind, title, year, runtime, rating, director and genre chips sit beside the
  artwork. Everything that identifies the title is above the fold.
- **Actions.** Compact pills sized to their labels — Save, watch status — then
  icon-only discs for favourite, lists and share. No full-width button rows.
- **Where to watch leads,** and stays collapsed to its provider logos, overlapped on
  the right of the header row, until you open it. Knowing where a title can be watched
  is the point of the panel, so it is no longer below the cast and the trailer.
- **Scores keep the audience review beside them** rather than as a separate quote.
- **The trailer stays the full-width 16:9 player.**
- **Your take is a bar pinned to the foot of the panel** that expands upward, present
  whether or not anything is written. It holds the watch date, the rating, the review
  and the private note, each with a plus when empty and a pencil when written. The
  lock only appears on the collapsed bar when a private note exists. Marking something
  watched is not repeated here — that is the status pill in the action row.

## Before implementation

- Rating is set by tapping the stars in the collapsed foot bar; there is no second
  rating control inside it.
- The series panel puts Up next at the top, then the season picker and episode list;
  see the `A · Series, mid-watch` artboard on the canvas.
- Open question: whether Mark watched / Open on <provider> in the Up next card should
  stack right-aligned beside the episode copy instead of sitting in a row beneath it.
  Both are drawn on the canvas.
- Mobile (`apps/mobile/components/MediaPanel.tsx`) has not been considered here.
