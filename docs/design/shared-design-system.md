---
status: active
owner: Savannah Black
last_reviewed: 2026-11-21
---

# Shared Design System

Plot uses one visual foundation across the app and the marketing site. The surfaces
do not need identical layouts, but they share the same brand mark, typography,
color roles, spacing rhythm, radii, motion language, and core control patterns.

The system is **warm, flat and quiet.** The ground is cream, the ink is a soft charcoal,
and structure comes from two creams and hairline borders, not from depth or color.
The brand pink is spent in two deliberate ways; sage green is the quieter second voice;
shadow is a legibility rescue only.

## The rules on one screen

Read the rest of this file before changing a role or a rule. For everyday work, these
are the ones that get broken:

1. **Reach for the token, never the hex.** Premium themes swap every accent value.
2. **Pink has jobs that never mix.** `--accent` colors type and line; `--accent-fill`
   colors surfaces and only sits behind `--on-accent-fill` text; `--accent-secondary`
   (sage green) marks availability and positive state. A fill never colors type, an icon
   or a border.
3. **The accent is earned.** Only the uses listed under [Where the accent may go](#where-the-accent-may-go).
   Never decorative fills, large surfaces, generic branding or inactive content.
4. **Flat.** No drop shadow on cards, panels, buttons or modals. `--shadow-overlay` only
   when an element would otherwise be lost against what is behind it. Never a shadow on text.
5. **One pink chip per panel.** Sage chips repeat freely; they are labels, not signals.
6. **Buttons are compact pills sized to their label**, never full-width (one exception for
   sheets, below).
7. **Charcoal says what, sage says which kind, pink says the one that matters.**

## The warm palette

Values are canonical in [`packages/core/tokens.js`](../../packages/core/tokens.js); this
table is the default family only.

| Role | Light | Dark | Notes |
| --- | --- | --- | --- |
| `--bg` | `#F8F2EA` | `#0c0c0c` | Cream ground. Marketing and app share it. |
| `--surface` | `#FFFCF7` | `#191919` | Warm surface for inputs and raised rows. |
| `--surface-raised` | `#FFFFFF` | `#242424` | Reserved for the rare element that must lift. |
| `--surface-sunken` | `#F1E9DC` | `#111111` | The deeper cream: cards, panels, secondary buttons, chips. |
| `--text-primary` | `#292924` | `#f0efe8` | Charcoal ink. Never `#000`. |
| `--text-secondary` | `#5F5A52` | `#a8a69c` | Body copy on marketing, secondary labels in the app. |
| `--text-muted` | `#6B655D` | `#919085` | 4.78:1 on the deeper cream, so it still passes on cards. |
| `--accent` | `#E05578` | `#F06A88` | Pink for type and line: small text, icons, rings, ranks. |
| `--accent-text` | `#B83558` | `#F06A88` | The accent darkened for small text on any cream. |
| `--accent-fill` | `#FF88C8` | `#FF88C8` | The brand pink as a surface. 1.97:1 on cream: never type. |
| `--on-accent-fill` | `#292924` | `#292924` | The only text color on the fill. 6.69:1. |
| `--accent-secondary` | `#5F7030` | `#C9D48A` | Sage green, the second voice. 4.9:1 on cream. |
| `--accent-secondary-fill` | `#DBE1B0` | `#DBE1B0` | The sage tint the green sits on as a chip. |

Every text token clears 4.5:1 on `--bg` **and** on `--surface-sunken`, because cards are
the sunken cream and carry body text.

### The wordmark

The mark is the lowercase word **plot** in Gabarito 700, tracked `−0.045em`, with the
l's foot swept into the o (Oct 2026). No full stop, no symbol, no mascot, no capitals,
no o→t join: all were explored and declined in the Sept and Oct 2026 brand passes.

The font can't set the join, so the mark is vector outlines, not live text. The paths
live once in `packages/core/wordmark.js` (the favicon and footer SVGs carry the same
outlines). Render it through `PlotLogo` (web; `inherit` matches surrounding text),
`PlotWordmark` (mobile), or `wordmarkSvg()` (website, edge functions, generators);
never a raster. Email is the one exception: clients don't render SVG, so emails use
`https://app.theplot.tv/logo-email.png` (130×72, transparent, regenerate it from
`wordmarkSvg()` when the mark changes) with `alt="plot"` styled in the display face
for clients that block images.

## Canonical sources

Values have one source of truth; the rendered page is the visual contract; this file is
the prose for what code can't encode. If a value here disagrees with the code, the code
is right and this file needs fixing. A *rule* here that the code breaks is a code bug.

- **Token values:** [`packages/core/tokens.js`](../../packages/core/tokens.js): colors
  (light, dark and every Premium family), radii, spacing. Cross-platform, CI-enforced.
- **Web CSS variables:** [`apps/web/src/styles/tokens.css`](../../apps/web/src/styles/tokens.css).
  The color and radii block is **generated** from `tokens.js` (`pnpm run tokens:build`;
  `pnpm run tokens:check` fails the build on drift). Web-only tokens (typography, layout,
  motion, glass, shadow) are hand-authored in the same file, outside the generated block.
- **Mobile tokens:** [`apps/mobile/lib/tokens.ts`](../../apps/mobile/lib/tokens.ts), derived from `tokens.js`.
- **Marketing tokens:** [`marketing/templates/base.css`](../../marketing/templates/base.css),
  checked against `tokens.js` by `pnpm run tokens:marketing`. The website itself uses
  `apps/website/theme.css` and `apps/website/ui.css`.
- **Living reference page:** [`apps/web/src/pages/DesignSystemPage.jsx`](../../apps/web/src/pages/DesignSystemPage.jsx),
  served at **`http://localhost:5177/design-system`** in dev builds only.
- **Shared components:** [`PlotLogo.jsx`](../../apps/web/src/components/PlotLogo.jsx),
  [`PlotLoader.jsx`](../../packages/ui/PlotLoader.jsx).

## Spending pink and green

### Three jobs

The pink and the green are not interchangeable.

- **`--accent` (the pink as type and line)**: small text, icons, focus and selection
  rings, rank numbers, the active tab underline. A signal spent on the few things that
  earn it.
- **`--accent-fill` (the pink as surface)**: the primary button, chips, the Live badge,
  the sign-up pill. It only ever sits behind `--on-accent-fill` text and never colors
  type, an icon or a border.
- **`--accent-secondary` (sage green)**: availability and "now at home" chips on its sage
  fill, a positive state beside the pink. Spent even more sparingly. Never a primary action.

Neutral UI is **cream, charcoal and the warm grays.** Neither pink nor green is a
general-purpose palette color. The meaning-bearing tokens under [Color roles](#color-roles)
are the separate, permitted exception.

### Where the accent may go

- **Actions and controls:** Save, favorite, delete/destructive confirm, logout, active
  tabs or indicators, and focus/hover states on interactive controls.
- **Selection and progress:** selected filters and provider cards, onboarding/import/watch
  progress and completion, checked/current episodes, calendar today/selected days, and the
  EPG now line/active program.
- **Status and labels:** top-ranked list items, Premium/public-list/cinema/date-group labels,
  profile and settings status, and other explicit account/integration state.
- **Genre tags:** the accent's pale tint (`--accent-dim`) with charcoal text (`.tag--genre`
  on web, `tone="genre"` on mobile), so genres read apart from sage, which marks a state.
  Tint only: never pink type or the pink fill on a genre. (Savannah, 20 Nov 2026.)
- **Featured and chart hierarchy:** Discover hero badges and active actions, chart ranks,
  official labels, and equivalent featured-image hierarchy.
- **Star ratings:** every drawn star and its score (title panel, review composer, card
  ratings) takes `--rating`, which is the theme's `--accent-text` in every theme. Never
  amber, never the fill. Exception: a rating chip on artwork behind a scrim (History
  posters) stays white for legibility.

Do not use it for decorative fills, large surfaces, generic branding, or inactive content.

### Premium themes

Each Premium family (`themeFamilies` in `tokens.js`) comes in light and dark, picked by
the same Light / Dark / System control as the default. Each variant carries its own
accent, fill and secondary set, so Blush's accent is a teal and Ink's light fill is black.

- **Only the hue moves.** The approved uses above and the three jobs stay exactly as they are.
- **Always the token, never the pink's hex.** Several family fills are about 1.3:1 against
  their own ground, so a fill on type or a line fails outright.
- **Tokens that exist because one theme's fill can't do every fill job:**
  `--artwork-fill` / `--on-artwork-fill` for a chip or stamp over a poster (Ink's black
  fill would vanish on a dark image), `--on-accent-secondary-fill` for text on the sage
  chip, `--highlight` for a marker stroke behind body text.
- **The default family is exactly the base tokens.** Every variant is held to 4.5:1 for
  text on each ground and fill, and 3:1 for the accent on its ground, by
  `packages/core/tests/unit/themes.test.js`.

Outside the app, keep the established pink treatment: the marketing website, tabs,
badges, hover/navigation copy, newsletter/templates, OG images, transactional emails,
and server-rendered public list/profile pages. The exception is the share cards made
from the share sheet: they use the viewer's own theme family
([`share-cards.md`](share-cards.md), Themes) and keep the pink on the default family.

## Flat, with one legibility rescue

Separation and grouping come from the **surface tokens** (`--bg` / `--surface` /
`--surface-raised` / `--surface-sunken`) and **hairline borders** (`--border` /
`--border-strong`), never from lift. No drop shadows on cards, panels, buttons or modals.

- **`--shadow-overlay` is the one shadow.** Use it only when an element would otherwise be
  hard to make out against what sits behind it: a dropdown, panel, icon or floating
  control over arbitrary or image content, where a hairline can't do the job.
- **Image scrims** may use a gradient where the image needs a fade. That is readability,
  not decorative depth.
- **State rings are not elevation.** Focus and selected rings may use an outline or an
  inset `box-shadow` (for example `.interactive-surface:focus-visible` and
  `.cal-mini-day--today` in `app.css`). They must stay visible in both themes.
- **Never a shadow on text.** No soft `text-shadow` to lift glyphs off an image. Put a
  scrim or a solid chip behind the text instead.
- **The one sanctioned `text-shadow`** is the chart rank numeral (`.rank-cut`): its outline
  is a ring of flat copies in `--bg` painted behind the glyph, so the numeral reads as cut
  out of the poster. No blur, no offset. It exists because `-webkit-text-stroke` paints
  over the fill. A blurred or offset shadow on any text, this numeral included, is out.

### Text over imagery

- **Hero or backdrop copy:** a dark scrim (`--image-scrim`, usually a
  bottom-to-transparent gradient) for a readable lower third that doesn't hide the art.
- **Badges and compact labels:** a small solid dark chip behind the text, modest radius
  and padding, no `text-shadow`.
- **Chart ranks:** the big pink numeral (`--accent`, never `--accent-fill`) cut out of the
  poster's bottom-left corner (`.rank-cut`), sized at 39% of the poster's width, hanging
  off the poster's left edge and clipped by `.rank-cut-frame`. The same on the Discover
  platform charts, the My Lists Top 5 and the public profile Top 5. A rank never gets a chip.
- **Always:** check contrast over light and dark image areas in both themes, against real
  artwork, and never rely on color alone for state.

## The reference: the Trending panel

The landing page's "Everything. In one place." section uses every color correctly. New
work should match it rather than invent a new distribution:

- **Cream panel** (`--surface-sunken`, no border, no shadow) on the cream ground, rows
  separated by hairlines.
- **Charcoal for everything that carries information:** panel title, rank numbers,
  titles; the meta line in the warm gray. Rank numbers here are charcoal, not pink.
- **One pink fill chip** (`--accent-fill`, charcoal text) on the single item that earns
  it: the lead, "Trending #1".
- **Sage chips** (`--accent-secondary-fill`, charcoal text) for kind and availability:
  "Film", "Series", "Now at home".
- **Genre tags** in the pale pink tint (`--accent-dim`, charcoal text), so genres don't
  read as a state like Watched or On your watchlist.
- **The secondary button** is the cream pill (`--surface-sunken`, charcoal text), "See
  what's on". The pink primary button appears in a section only when the action is the
  point of the section (the hero, the sign-up), not beside a panel.
- **Pink as type** (`--accent`) is reserved for the smallest cues: an eyebrow, a date,
  a live dot. It does not appear in this panel at all, and that is correct.

## Shared foundations

### Typography: two faces, two jobs

- `--font-display` (Gabarito 700, tracked `--font-display-tracking`, `−0.03em`): the
  wordmark, page titles, section headings, panel titles, rank numbers, and the former
  serif uses (quotes, notes, review slips, avatar initials). Quoted speech is Gabarito 500
  in quotation marks; there is no italic face.
- `--font-sans` (DM Sans): body, controls, forms, navigation, metadata, dense UI.
  `--font-sans-tabular` for figures that must line up.
- Instrument Serif was retired on 16 Sep 2026. Don't bring a serif back.
- On the marketing site the same two are `--display` / `--sans` in `apps/website/theme.css`.

### Color roles

The full list, with values per theme, is `tokens.js`. Grouped by job:

- **Ground and ink:** `--bg`, `--surface`, `--surface-raised`, `--surface-sunken`,
  `--text-primary`, `--text-secondary`, `--text-muted`, `--border`, `--border-strong`.
- **Pink, type and line:** `--accent`, `--accent-text`, `--accent-dim`, `--rating`.
- **Pink, surface:** `--accent-fill`, `--accent-fill-hover`, `--on-accent-fill`,
  `--artwork-fill`, `--artwork-fill-hover`, `--on-artwork-fill`, `--highlight`.
- **Sage:** `--accent-secondary`, `--accent-secondary-dim`, `--accent-secondary-fill`,
  `--on-accent-secondary-fill`.
- **Over imagery:** `--image-scrim`, `--image-text-primary`, `--image-text-secondary`.
- **Meaning, not decoration** (permitted outside the accent rules because they carry information):
  - Guide and time: `--chip-now`, `--chip-today`, `--chip-tomorrow`, `--chip-soon`,
    `--chip-cinema`, `--chip-streaming`, `--chip-episode`, `--epg-bar-stream`,
    `--epg-bar-broadcast`.
  - Watch state: `--status-watching` (and `-dim`) for in progress, `--status-watched`
    (and `-dim`) for done.
  - Outcome of an action: `--success`, `--success-dim`, `--success-border`; `--danger`,
    `--danger-dim`, `--danger-border`. Success and watched share a green today on purpose;
    keep them separate tokens so either can move.
  - Profile badges: `--badge-premium` (blue, paid Premium) and `--badge-supporter`
    (pink, Ko-fi supporter). Two different things, so two different hues.

### Spacing and shape

- **Spacing** (`spacing` in `tokens.js`): `xs` 4px tight chip and icon gaps · `sm` 8px
  compact internal spacing · `md` 12px dense cards and small toolbars · `lg` 16px default
  card and form padding · `xl` 24px panel and section spacing · `xxl` 32px+ hero and
  major layout separation.
- **Radii** (`radii` in `tokens.js`): `--radius-badge` 10px chips and badges ·
  `--radius-md` 16px cards, panels, inputs, rows, swatches · `--radius-lg` 24px sheets and
  larger containers · `--radius-pill` buttons and filter controls.
  Cards are 16px on both surfaces: `--radius-md` in the app, `--r-md` on the website
  (Savannah, 21 Nov 2026; the website's `.card` was 20px until then).

### Components

Marketing in `apps/website/ui.css`, the app in `app.css` and co-located component CSS.

- **Buttons are pills.** Primary is the pink fill with charcoal text; secondary is the
  deeper cream; ink is charcoal with cream text for the rare emphatic case. An outline
  pill (1px `--border-strong`, no fill, `.btn-ghost`) is only for on/off actions in a row,
  such as Follow and alerts (Nov 2026).
- **Chips** are small pills in the deeper cream; the pink fill marks the lead, the sage
  fill marks kind and availability, the pale pink tint marks genre.
- **Cards and panels** are the deeper cream with no border and no shadow. Rows inside
  them separate with a hairline.

## Shared interaction rules

- **Motion explains a state change before it decorates.** Fast interactions use
  `--transition-fast` (0.15s); larger surface transitions use `--transition` (0.3s on
  `--ease`). Nothing bounces on routine navigation.
- **The loader** (`PlotLoader`) stays centered: a faint wordmark that fills left to
  right, each pass in the next color (charcoal, grey, pink, grey). Use it rather than a
  one-off spinner on branded surfaces.
- **Icons** stay monochrome and lightweight until hover, focus or active state.
- **Buttons are compact and sized to their label, never full-width.** The one exception
  is a bottom sheet's action row: when a sheet ends in a pair of actions they may share
  the row in equal widths inside the sheet's padding. A row of two, not one stretched
  button, and for sheets only (Savannah, 2 Oct 2026).
- **Customize**, on every page that has one (Home, My Lists), is a quiet text action
  centered at the foot of the page, at every width and on both apps. Not in the title
  bar, a top toolbar or a side card (Savannah, 12 Nov 2026).
- **Pop-up headers** (dialogs, bottom sheets, full-page sheets) are the same on web and
  mobile: the title on the left, the word Cancel on the right (Savannah, 12 Nov 2026).
  - A picker that applies as you tap says Done instead of Cancel.
  - The header never holds Save. A pop-up that edits something has its one main button
    bottom right, and nothing is kept until it is pressed.
  - A confirm pop-up ends in Cancel and the action side by side, with no header Cancel.
  - The title panel and other long-form panels keep their ✕ over the artwork.
  - Components: web `SheetHeader` / `ResponsiveDialog` / `DialogActions`; mobile
    `ModalHeader` / `PageSheet` / `BottomSheet` / `useDialog`.

## Accessibility contract

- WCAG 2.2 AA contrast: 4.5:1 for normal text, 3:1 for large text, 3:1 for essential
  non-text controls and focus indicators.
- Every keyboard-operable control has a visible `:focus-visible` treatment that no
  outline reset removes, in both themes.
- Never communicate status, selection or progress through color alone; pair it with
  text, an icon, a shape or a checkmark.
- Touch targets give at least 44×44 CSS px of hit area. A compact control may expand its
  hit area invisibly to get there.
- Honor `prefers-reduced-motion: reduce`: remove non-essential transforms and staggered
  animation, keep state changes and loading feedback.
- Text over posters and backdrops follows the imagery recipe above and must stay readable
  against the actual image, not a placeholder.

## Reusable patterns

Reuse these rather than re-deriving a near-miss. The first three came from the title
panel redesign (savblack/PLOT#976, Sept 2026). All follow the standing rules: flat,
structure from hairlines and surface tokens, `--status-watching` for progress, and the
accent reserved for interaction and hierarchy.

- **The pinned foot bar** (`.foot-bar`, `TitleFootBar.jsx`, state in
  `packages/core/useTitleFootBar.js`). A `position: sticky; bottom: 0` bar inside the
  panel's own scroll container, on `--surface-sunken` with one `--border` hairline on top,
  so the one thing we most want from the reader is never out of reach. It opens folded to
  its head line and slides open once the panel scrolls; tapping the head line folds or
  opens it by hand for the rest of the session, and a panel too short to scroll opens it
  straight away (#1811, Nov 2026). One grid in every state: a head line (Watched it? or
  Thoughts?, with the watch chip on the right), the stars with the one next action beside
  them, then a Review box and a Private note box once the title is watched. The icon
  carries the affordance on the boxes (plus when empty, pencil when written); the only
  button copy is the single next action while unwatched. Editing replaces the stars and
  boxes with one editor that grows upward on a panel and is a bottom sheet on a touch
  device. The Review box is solid and accented; the Private note box is outlined and
  muted, so the two never read as the same kind of thing. Use it for the panel's primary
  contribution, not navigation or a second row of actions.
- **Disclosure cards** (`.panel-card` + `.panel-disclosure`). A sunken card whose header
  is a bare `<button>` carrying `aria-expanded`, with the chevron as a direct child
  (`.panel-disclosure > svg`, scoped so it doesn't recolor icons inside the row). Collapsed,
  the header keeps the answer visible in miniature (Where to watch shows overlapped provider
  marks), so collapsing hides detail, never the fact. Prefer it to a tab or jump link when
  a section is long but its summary is one glance.
- **The segmented run bar** (`.collection-run-seg`). Progress through a countable set is
  one segment per item: 8px tall, pill radius, `--status-watching` when done and a 12%
  `--text-primary` mix when not. It reads as "three of seven films" without a label. A
  continuous bar is still right for progress through one thing (an episode, an upload).
- **Shared building blocks:** `PlotLogo` for the wordmark, `PlotLoader` for loading, and
  the same button families, input treatments, chips, legal-page layouts and quiet
  empty-state tone on both surfaces.

## Surface ownership

- **Always shared:** logo, loader, typography, color roles, spacing rhythm, radii,
  borders, the accent and shadow rules, buttons, inputs, link treatment.
- **Shared with freedom:** poster walls, hero art, editorial copy and empty-state
  illustration may vary if they sit on the shared tokens.
- **App-specific:** app shell, tab bars, guide rails, calendar controls, media chips,
  management flows.
- **Marketing-specific:** campaign storytelling, large hero composition, conversion sections.

Keep these aligned first whenever the system moves: auth pages, the public
placeholder/profile route, the app shell header and drawer, legal/support pages, and
logo and loader usage everywhere.

## Changing the system

1. Edit the canonical source (`packages/core/tokens.js` for shared values, or the owning
   platform file for platform-specific presentation).
2. Regenerate managed CSS with `pnpm run tokens:build`; never hand-edit the generated block.
3. Update the living reference page and this file when a role, rule or usage boundary
   changes. Record who approved it and when, as the dated rules above do.
4. Run `pnpm run tokens:check`, `pnpm run tokens:marketing` and `pnpm run check`, plus the
   unit and type checks for the affected platform.
5. Review light and dark themes, keyboard focus, reduced motion and real image surfaces
   before merging.

Keep deprecated tokens or patterns documented until their consumers are removed, and
bump `last_reviewed` above with the next design-system review.
