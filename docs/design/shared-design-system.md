---
status: active
owner: Savannah Black
last_reviewed: 2026-09-16
---

# Shared Design System

plot uses one visual foundation across the app and the marketing site. The surfaces
do not need identical layouts, but they should share the same brand mark, typography,
color roles, spacing rhythm, radii, motion language, and core control patterns.

The system is **warm, flat and quiet.** The ground is cream, the ink is a soft charcoal,
and structure comes from two creams and hairline borders, not from depth or colour.
Semantic guide and status colours remain valid when they communicate time, availability,
media type, or account state. The brand pink is spent in two deliberate ways (below);
shadow is a legibility rescue only.

## The warm palette (Sept 2026)

| Role | Light | Notes |
| --- | --- | --- |
| `--bg` | `#F8F2EA` | Cream ground. Marketing and app share it. |
| `--surface` | `#FFFCF7` | Near-white warm surface for inputs and raised rows. |
| `--surface-raised` | `#FFFFFF` | Pure white, reserved for the rare element that must lift. |
| `--surface-sunken` | `#F1E9DC` | The deeper cream: cards, panels, secondary buttons, chips. |
| `--text-primary` | `#292924` | Charcoal ink. Never `#000`. |
| `--text-secondary` | `#5F5A52` | Body copy on marketing, secondary labels in the app. |
| `--text-muted` | `#6B655D` | 4.78:1 on the deeper cream, so it still passes on cards. |
| `--accent` | `#E05578` | The pink for small text, icons, rings, rank numbers. Unchanged. |
| `--accent-text` | `#B83558` | The accent darkened for small text on any cream. |
| `--accent-fill` | `#DBE1B0` | Marshmallow-soft sage as a **fill** behind charcoal text. See below. |
| `--on-accent-fill` | `#292924` | The only text colour that goes on the fill. 10.7:1. |

Dark mode is unchanged: the warm-neutral `#0c0c0c` / `#f0efe8` scale already fit, and
the fill is the same sage in both themes.

### The wordmark

The mark is the plain lowercase word **plot** in Gabarito 700, tracked `−0.045em`.
No full stop, no symbol, no mascot: all three were explored and declined in the Sept
2026 brand pass. Render it as text through `PlotLogo` (web) or the display face
(marketing, edge functions); never a raster.

## Canonical sources

The design system lives in code, in layers. Values have one source of truth; the
rendered page is the visual contract; this file is the prose for what code can't encode.

- **Token values (canonical):** [`packages/core/tokens.js`](../../packages/core/tokens.js)
  — colors (light + dark), radii, and spacing. Cross-platform, CI-enforced.
- **Web CSS variables:** [`apps/web/src/styles/tokens.css`](../../apps/web/src/styles/tokens.css)
  — the color + radii block is **generated** from `tokens.js` (`pnpm run tokens:build`;
  `pnpm run tokens:check` fails the build on drift). Web-only tokens (typography, layout,
  motion, glass, shadow) are hand-authored in the same file, outside the generated block.
- **Mobile tokens:** [`apps/mobile/lib/tokens.ts`](../../apps/mobile/lib/tokens.ts) — derives from `tokens.js`.
- **Marketing tokens:** [`marketing/templates/base.css`](../../marketing/templates/base.css)
  — checked against `tokens.js` by `pnpm run tokens:marketing`.
- **Living reference page:** [`apps/web/src/pages/DesignSystemPage.jsx`](../../apps/web/src/pages/DesignSystemPage.jsx)
  — the rendered inventory. Served at **`http://localhost:5177/design-system`** in dev
  builds only; it is intentionally not shipped to production.
- **Shared components:** [`PlotLogo.jsx`](../../apps/web/src/components/PlotLogo.jsx),
  [`PlotLoader.jsx`](../../apps/web/src/components/PlotLoader.jsx).

## The two spending rules

### Accent and fill — two colours, two jobs

The pink and the sage are not interchangeable.

- **`--accent` (`#E05578` light / `#F06A88` dark)** colours *type and line*: small
  text, icons, focus and selection rings, rank numbers, the active tab underline. It is
  a signal you spend on the few things that earn it.
- **`--accent-fill` (`#DBE1B0`, sage)** colours *surfaces*: the primary button, chips, the
  Live badge, the sign-up pill. It only ever sits behind `--on-accent-fill` charcoal
  text. It is too light to carry text itself and must never colour type, an icon, or a
  border. (The pink `#FF88C8` fill was tried first and replaced by the sage.)

Neutral UI is **cream, charcoal and the warm greys.** Neither the pink nor the sage is a general-purpose
palette colour. Semantic guide/status tokens are the separate, permitted exception for
meaning.

Keep the accent for these approved interaction and hierarchy cues:

- **Actions and controls** — Save, favourite, delete/destructive confirm, logout, active
  tabs or indicators, and focus/hover states on interactive controls.
- **Selection and progress** — selected filters and provider cards, onboarding/import/watch
  progress and completion, checked/current episodes, calendar today/selected days, and the
  EPG now line/active programme.
- **Status and labels** — top-ranked list items, Premium/public-list/cinema/date-group labels,
  profile and settings status, and other explicit account/integration state.
- **Featured and chart hierarchy** — Discover hero badges and active actions, chart ranks,
  official labels, and equivalent featured-image hierarchy.

Do not use it for decorative fills, large surfaces, generic branding, or inactive content.
Outside the app, retain the established pink treatment in the marketing website, tabs,
badges, hover/navigation copy, newsletter/templates, OG/share cards, transactional emails,
and server-rendered public list/profile pages.

### Shadows — flat with hairlines; shadow only as a legibility rescue

Flat by default. Separation and grouping come from the **surface tokens**
(`--bg` / `--surface` / `--surface-raised` / `--surface-sunken`) and **hairline borders**
(`--border` / `--border-strong`), never from lift. Do not add drop shadows to cards,
panels, buttons, or modals to make them look raised.

A drop shadow is allowed only when an element would otherwise be **hard to make out against
what sits behind it** — for example a dropdown, panel, icon, or floating control over
arbitrary or image content, where a hairline can't do the job. That functional case is the
single `--shadow-overlay` token. Image scrims may use a gradient where the image needs a
fade; this is readability treatment, not decorative depth.

State rings are separate from elevation: visible keyboard-focus rings and selected-state
rings may use an outline or an inset `box-shadow` to mark state (for example the
[interactive focus ring](../../apps/web/src/styles/app.css#L622) and
[today in the Calendar mini month](../../apps/web/src/styles/app.css#L1944)). They do not count as
decorative lift and must remain visible in both themes.

**Never apply a shadow to text.** No `text-shadow`, anywhere. When text must stay legible
over an image, put a scrim or solid chip behind it — the shadow goes on the surface, not
on the glyphs.

### Text over imagery

- **Hero or backdrop copy:** use a dark image scrim, usually a bottom-to-transparent
  gradient, to create a readable lower-third without obscuring the artwork.
- **Ranks, badges, and compact labels:** use a small solid dark chip behind the text with
  a modest radius and padding. Keep the glyphs free of `text-shadow`.
- **Both treatments:** verify readable contrast over light and dark image areas in both
  themes; never rely on colour alone to communicate the state.

## Shared foundations

- Typography — two faces, two jobs:
  - `--font-display` (Gabarito, 700, tracked `−0.03em`) for the wordmark, page titles,
    section headings, panel titles and rank numbers. This is the headline voice.
  - `--font-sans` (DM Sans) for body, controls, forms, navigation, metadata, dense UI.
  - Instrument Serif is **retired** (16 Sep 2026): every former serif use, including quotes,
    notes, review slips and avatar initials, is now Gabarito. There is no italic face; quoted
    speech is Gabarito 500 in quotation marks.
  - On the marketing site the same two are `--display` / `--sans` in
    `apps/website/theme.css`, with shared components in `apps/website/ui.css`.
- Color roles:
  - `--bg`, `--surface`, `--surface-raised`, `--surface-sunken`
  - `--text-primary`, `--text-secondary`, `--text-muted`
  - `--border`, `--border-strong`
  - `--accent`, `--accent-text`, `--accent-dim` (type and line), `--accent-fill`,
    `--accent-fill-hover`, `--on-accent-fill` (surfaces), `--danger`, `--danger-dim`,
    `--danger-border`
- Components (marketing `ui.css`, app `app.css`):
  - **Buttons** are pills. Primary is the sage fill with charcoal text; secondary is the
    deeper cream; ink is charcoal with cream text for the rare emphatic case. No outline
    buttons.
  - **Chips** are small pills in the deeper cream; the sage fill marks the lead, a rank or
    availability.
  - **Cards and panels** are the deeper cream at 20px radius with no border and no shadow.
    Rows inside them separate with a hairline.
- Semantic guide/status roles (meaning-bearing colours, not neutral surfaces):
  - `--chip-now`, `--chip-today`, `--chip-tomorrow`, `--chip-soon`, `--chip-cinema`,
    `--chip-streaming`, `--chip-episode`
  - `--epg-bar-stream`, `--epg-bar-broadcast`
- Spacing rhythm (`packages/core/tokens.js` `spacing`):
  - `4px` tight chip and icon gaps · `8px` compact internal spacing · `12px` dense cards
    and small toolbars · `16px` default card and form padding · `24px` panel and section
    spacing · `32px+` hero and major layout separation.
- Shape:
  - `--radius-md` ordinary cards, inputs, rows, swatches.
  - `--radius-lg` sheets and larger containers.
  - `--radius-badge` chips and badges.
  - `--radius-pill` primary actions and filter controls.

## Shared interaction rules

- Motion should explain state changes before it decorates them.
- Fast interactions use `--transition-fast`; larger surface transitions use `--transition`.
- The bounce easing token is reserved for special arrivals, not routine navigation.
- The PLOT loader stays centered and fades each letter in sequence.
- Icons stay monochrome and lightweight until hover, focus, or active state.
- Buttons are compact and sized to their label — never full-width.

## Accessibility contract

- Meet WCAG 2.2 AA contrast: at least 4.5:1 for normal text, 3:1 for large text, and
  3:1 for essential non-text controls and focus indicators.
- Every keyboard-operable control has a visible `:focus-visible` treatment that is not
  removed by an outline reset. Focus must remain visible in both themes.
- Never communicate status, selection, or progress through colour alone; pair colour with
  text, an icon, a shape, a checkmark, or another structural cue.
- Touch targets provide at least 44×44 CSS px of hit area. A compact visual control may
  use an invisible padding/hit-area expansion to meet this requirement.
- Honour `prefers-reduced-motion: reduce` by removing non-essential transforms, bounce,
  and staggered animation while preserving state changes and loading feedback.
- Text over posters/backdrops follows the image recipe above and must remain readable
  against the actual image, not only a placeholder or average background.

## Shared components and patterns

- Use `PlotLogo` for the wordmark rather than redrawing or typesetting it manually.
- Use `PlotLoader` for loading states rather than one-off spinners on branded surfaces.
- Reuse the same button families, input treatments, chips, legal-page layouts, and quiet
  empty-state tone across both surfaces.

## Surface ownership

- Always shared:
  - Logo, loader, typography, color roles, spacing rhythm, radii, borders, the accent and
    shadow rules, buttons, inputs, and link treatment.
- Shared with freedom:
  - Poster walls, hero art, editorial copy, and empty-state illustration can vary if they
    still sit on the shared token system.
- App-specific:
  - App shell, tab bars, guide rails, calendar controls, media chips, and management flows.
- Marketing-specific:
  - Campaign storytelling, large hero composition, and conversion sections.

## Maintenance workflow

When changing the system:

1. Edit the canonical source (`packages/core/tokens.js` for shared token values, or the
   owning platform file for platform-specific presentation).
2. Regenerate managed CSS with `pnpm run tokens:build`; never hand-edit the generated block.
3. Update the living reference page and this document when a role, rule, or usage boundary
   changes.
4. Run `pnpm run tokens:check`, `pnpm run tokens:marketing`, and `pnpm run check` (plus the
   relevant unit/type checks for the affected platform).
5. Review light/dark themes, keyboard focus, reduced motion, and representative image
   surfaces before merging.

Keep deprecated tokens or patterns documented until their consumers are removed. Record
material changes in the pull request so the owner and `last_reviewed` metadata can be
updated with the next design-system review.

## Highest-visibility baseline

These surfaces should stay aligned first whenever the system evolves:

- Auth pages
- Public placeholder/profile route
- App shell header and drawer
- Legal/support pages
- Loader and logo usage everywhere
