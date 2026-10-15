# Share cards

Shareable stat cards, in the style of Wispr Flow's, for X, Threads and Instagram
Stories. Approved on the canvases of 18 to 29 September 2026. This is the spec for
building them; the decisions on scope are in
`docs/adr/0001-share-cards-are-owner-only-and-open-in-a-modal.md`.

Canvases (private, owner's Claude account): the cards
`https://claude.ai/artifact/2gkRxbuAHoRuoEgE5L1Lzn`, the paths
`https://claude.ai/artifact/GYMEp2YctbVAuHmigJbtr9`.

## The cards

One brag per card. One brand colour per card, a cream panel (`#FFFCF7`) where the
number lives, charcoal ink, the lowercase wordmark ghosted behind at 9% opacity
(6% on the cream card) as the background art, and a footer with the wordmark and
either `theplot.tv` or the owner's `@handle` (never the profile URL; see the
@handle rule in the design system).

| Card | Ground | Data (all free tier, `packages/core/historyStats.js` unless noted) | Appears when |
|---|---|---|---|
| Highlights ("Your year so far") | sage | count, `movieMinutes`, `topGenreId`, `averageStars` | 10 titles this year |
| Streak | pink | `streaks().current` | current streak of 3 or more |
| Activity | cream | watch days from `calendarParts`: the year to date on a post, the last 13 weeks on a story, one pink best day named under the grid | watches on 15 distinct days since 1 January |
| You vs the crowd | charcoal | `crowdComparison` then `crowdSentence` (against TMDB, never other users) | 10 rated titles with TMDB votes |
| Top 5 movies | cream | `useTopLists`, TMDB posters, rank numerals as the chart cut-out | the list has 5 |
| Top 5 TV series | sage | as above | the list has 5 |
| Genres | rose | `genreCounts` + `useGenres`, five bars, lead bar pink, rest sage | 20 titles with genres |
| Your person | sage | `recurringPeople`, TMDB headshot, the line it already writes | someone in 3 or more titles |
| Month wrap | pink | `monthInsight`, `titlePerDay`, `streaks` for last month | 5 titles last month |

Formats: 1200 × 800 (3:2) for X and Threads, 1080 × 1920 (9:16) for Stories. The
story keeps a short title with the kind as a pink chip ("Savannah's Top 5 · Movies"),
runs the wordmark up the right edge as the ghost, and puts the `@handle` up the same
edge in the fill pink (charcoal on the pink card).

Rank numerals on the Top 5 cards are the chart cut-out from `app.css` (`.rank-cut`):
pink numeral, ring of text-shadows in the card colour, 36% of the poster width,
hanging off the bottom-left corner. Where a numeral crosses the ghost wordmark the
ring takes the ghost's blended colour (`#ECE6DE` on cream, `#CBD0A3` on sage).

The Activity grid has the weekdays down the side, labelled M T W T F S S, one equal square
per day and a week per column, with month names over the week each month starts. A post
shows the year to date: the week holding 1 January to this week, so the grid grows through
the year, and the cells stop growing at a set size so a young year is a small grid, not a few
huge squares. A story is too narrow for that many columns, so it shows the last 13 weeks
with its own months and its own best day. Days outside the range (before 1 January, after
today) are faint placeholders so the grid stays a rectangle without reading as watched or
missed days. Today has a charcoal ring. `activityCard` returns both (`weeks` and `quarter`);
the web and mobile cards read the one their format needs.

Cards below their threshold stay in the carousel, locked, with the number that
unlocks them ("Rate 10 titles to unlock · 7 of 10"). A locked card never renders
half-empty and hides the share bar.

## Themes

The cards are drawn in the viewer's own theme family: the share sheet reads `themeFamily`
from the app (already Premium-gated by `useTheme`), and `ShareCard` takes it as `family`.
The layout never changes, only the roles:

| Role on the default card | Takes, from the family's light variant |
|---|---|
| Pink (accent: chips, best day, rank numerals, lead bar, avatar ring, the pink grounds) | `accentFill`, with `onAccentFill` for text on it |
| Sage (second voice: heat levels, chips, other bars, the sage grounds) | `accentSecondaryFill`, with `accentSecondary` for the darker heat level |
| Cream ground | `bg` |
| Cream panel | `surfaceRaised` |
| Ink and soft ink | `textPrimary` and `textSecondary` |
| Charcoal ground and its ink | the family's dark `surface` and `textPrimary` |

`shareCardPalette(family)` in `packages/core/shareCards.js` returns those as CSS custom
properties (`--sc-*`) for the card's root. The default family returns null, and the defaults
defined once on `.sc` apply. Only the family is used: the app's light or dark mode does not
change the cards, because the image goes to someone else's feed. Ink turns the pink cards
black with white text, and Plum's yellow rank numerals are the faintest on their lavender
ground. Mobile has no Premium themes yet (they are web-only, issue #1090), so mobile cards
stay on the default family until it does; `ShareCardView` can read the same palette then.

## The paths

Three ways in and two moments, all into one sheet, which opens on the card the user
came for.

1. **From the insight.** A share icon in the head of each History side card (Year,
   Month, Crowd, People). Pink when that card is shareable now, cream when its data
   is thin. Preset: the card tapped.
2. **From the own profile.** "Share profile" becomes a two-item menu: *Copy profile
   link* (today's behaviour, first) and *Share a card*. Preset: Top 5 movies, the
   card that carries the follow link. Other people's profiles keep the single link
   button.
3. **The moment.** The watched toast gains a share action when a streak reaches 7,
   14, 30 and every 30 after ("That's a 7-day streak · Share it"), once per
   milestone. On the 1st, a `month_wrap` notification carries last month's
   `monthInsight` sentence and one button. Mobile push deep-links the same way.

## The sheet

- Web: a modal over the current page. Mobile: a bottom sheet. Deep link:
  `?share=<card>` on the page the user would open anyway. No `/share` route.
- Header: title, Post / Story segmented control.
- Carousel of only the cards that have data, plus locked ones; dots underneath.
- Caption, prewritten from the card's own sentence plus the profile link, editable,
  and what goes into the X or Threads intent.
- Web bar: **Copy image** pill, then round buttons for Download, X, Threads,
  Instagram. All in the deeper cream (`--surface-sunken`) with charcoal icons.
- Mobile bar: **Share…** (OS share sheet with the PNG and caption) and Save to
  Photos. No per-network buttons; the OS has them.

After the button, on web:

| Target | What happens |
|---|---|
| X | PNG to the clipboard, `x.com/intent/post` opens with the caption, toast: "Image copied. Paste it into your post." |
| Threads | Same through `threads.net/intent/post`. |
| Instagram | Download the 9:16 PNG, toast: "Saved. Add it to your story from Instagram." |
| Download / Copy | PNG in the chosen format; toast offers "Open X" as the next step. |

## Rendering

Client-side, from a shared card component: the same JSX the carousel previews is
captured to a PNG (html-to-image on web, `react-native-view-shot` on mobile). Not
the og-card Edge Function (the link-preview renderer), which would need signed
URLs for private stats.

## Build order

Each piece ships on its own.

1. `packages/core/shareCards.js`: pure functions from history rows to each card's
   data, with the thresholds above. Unit-tested in core.
2. One React component per card on web, the same tree captured on mobile.
3. `ShareCardSheet` plus a `useShareCard()` hook that any surface can call; extends
   `useShare` with an image. `?share=<card>` opens it on load.
4. Path 1 (History icons) with Highlights, Streak and Top 5 first.
5. Path 2 (profile Share menu; `KebabMenu` already has the shape).
6. Path 3 (streak condition in the watched toast; `month_wrap` notification from the
   existing monthly cron).
7. Analytics: `share_card_open` (source, card) and `share_card_send` (card, format,
   target). Source is what tells us which path earns the posts.

## Copy

All user-facing strings go in `packages/core/copy` (a `shareCards.js` module), never
inline, so web and mobile read the same words. No em dashes.
