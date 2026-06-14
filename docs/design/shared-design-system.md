# Shared Design System

PLOT uses one visual foundation across the app and the marketing site. The surfaces do not need identical layouts, but they should share the same brand mark, typography, color roles, spacing rhythm, radii, shadows, motion language, and core control patterns.

## Canonical Sources

- Tokens: [src/styles/tokens.css](/Users/savannahblack/.codex/worktrees/122d/PLOT/src/styles/tokens.css)
- Living reference page: [src/pages/DesignSystemPage.jsx](/Users/savannahblack/.codex/worktrees/122d/PLOT/src/pages/DesignSystemPage.jsx)
- Shared logo wrapper: [src/components/PlotLogo.jsx](/Users/savannahblack/.codex/worktrees/122d/PLOT/src/components/PlotLogo.jsx)
- Shared loader: [src/components/PlotLoader.jsx](/Users/savannahblack/.codex/worktrees/122d/PLOT/src/components/PlotLoader.jsx)

## Shared Foundations

- Typography:
  - `--font-serif` for brand, editorial headings, and expressive page titles.
  - `--font-sans` for controls, forms, navigation, metadata, and dense product UI.
- Color roles:
  - `--bg`, `--surface`, `--surface-raised`, `--surface-sunken`
  - `--text-primary`, `--text-secondary`, `--text-muted`
  - `--border`, `--border-strong`
  - `--accent`, `--accent-dim`, `--danger`, `--danger-dim`, `--danger-border`
- Spacing rhythm:
  - `4px` for tight chip and icon gaps.
  - `8px` for compact internal spacing.
  - `12px` for dense cards and small toolbars.
  - `16px` for default card and form padding.
  - `24px` for panel and section spacing.
  - `32px+` for hero and major layout separation.
- Shape:
  - `--radius-md` for ordinary cards, inputs, rows, and swatches.
  - `--radius-lg` for sheets and larger containers.
  - `--radius-badge` for chips and badges.
  - `--radius-pill` for primary actions and filter controls.
- Depth:
  - `--shadow-xs` default bounded card lift.
  - `--shadow-sm` subtle raised controls.
  - `--shadow-md` panels and overlays.
  - `--shadow-lg` rare high-emphasis hero depth.

## Shared Interaction Rules

- Motion should explain state changes before it decorates them.
- Fast interactions use `--transition-fast`; larger surface transitions use `--transition`.
- The bounce easing token is reserved for special arrivals, not routine navigation.
- The PLOT loader stays centered and fades each letter in sequence.
- Icons stay monochrome and lightweight until hover, focus, or active state.

## Shared Components and Patterns

- Use `PlotLogo` for the wordmark rather than redrawing or typesetting it manually.
- Use `PlotLoader` for loading states rather than one-off spinners on branded surfaces.
- Reuse the same button families, input treatments, chips, legal-page layouts, and quiet empty-state tone across both surfaces.

## Surface Ownership

- Always shared:
  - Logo, loader, typography, color roles, spacing rhythm, radii, shadows, buttons, inputs, and link treatment.
- Shared with freedom:
  - Poster walls, hero art, editorial copy, and empty-state illustration can vary if they still sit on the shared token system.
- App-specific:
  - App shell, tab bars, guide rails, calendar controls, media chips, and management flows.
- Marketing-specific:
  - Campaign storytelling, large hero composition, and conversion sections.

## Highest-Visibility Baseline

These surfaces should stay aligned first whenever the system evolves:

- Auth pages
- Public placeholder/profile route
- App shell header and drawer
- Legal/support pages
- Loader and logo usage everywhere
