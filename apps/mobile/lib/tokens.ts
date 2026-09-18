/**
 * Design tokens. Color + radius VALUES come from the shared @plot/core
 * package so
 * they can't drift from the web app. Fonts, spacing and font sizes are
 * mobile-specific (RN bundles fonts by name; these don't map 1:1 to web CSS).
 */
import { colors as coreColors, radii as coreRadii, spacing as coreSpacing } from '@plot/core/tokens.js';

export type Palette = { readonly [K in keyof typeof coreColors.light]: string };

// Full palette per resolved theme. `dark` in the core holds only the values
// that differ from light, so the full dark palette is light overlaid with it.
export const palettes: { light: Palette; dark: Palette } = {
  light: coreColors.light,
  dark: { ...coreColors.light, ...coreColors.dark },
};

// Static light palette. Theme-aware code should use useTheme() from
// contexts/ThemeContext instead; this remains for module-scope styles that
// don't depend on the active theme.
export const colors: Palette = palettes.light;

export const radii = {
  sm: 8, // mobile-only; the web theme has no --radius-sm
  ...coreRadii,
} as const;

// Shared with web via the @plot/core package so the base-4 spacing scale can't drift across platforms.
export const spacing = coreSpacing;

// Square icon-button hit areas (mobile-only — RN has no CSS equivalent to
// share with web). Screens previously duplicated ad hoc sizes (22/28/34px)
// per-component; use these instead so icon buttons stay consistent.
export const iconButtonSize = {
  sm: 22, // compact inline toggles (e.g. list-check circles)
  md: 28, // default poster-card/rail action buttons
  lg: 34, // primary row actions (e.g. search result save/favorite/watched)
} as const;

export const fontFamily = {
  // Display: Gabarito, the headline voice. Page titles, section headings, the
  // wordmark, rank numbers. displaySemi for card names and list titles.
  display:     'Gabarito-Bold',
  displaySemi: 'Gabarito-SemiBold',
  sans:        'DMSans-Regular',
  sansMedium:  'DMSans-Medium',
  sansBold:    'DMSans-SemiBold',
  // Same faces with the ten digits respaced to a common width, for numbers that
  // stack in a column or change in place — ranks, day numbers, stat counts. DM Sans
  // ships no `tnum` feature, and React Native has no `unicode-range`, so these
  // are full cuts rather than the digits-only files the web uses: a Text takes one
  // family, and anything but full coverage would drop letters to the system font.
  // Not for running text, where proportional digits read better.
  // Built by scripts/build-tabular-digits.py.
  sansTabular:       'DMSans-TabularRegular',
  sansTabularBold:   'DMSans-TabularSemiBold',
} as const;

export const fontSize = {
  xs:   11,
  sm:   13,
  md:   15,
  lg:   17,
  xl:   20,
  xxl:  26,
  hero: 34,
} as const;

// TMDB image helpers — mirrors web App.jsx
const TMDB_IMG = 'https://image.tmdb.org/t/p';
export const posterUrl   = (path: string | null | undefined, size = 'w342') =>
  path ? `${TMDB_IMG}/${size}${path}` : null;
export const backdropUrl = (path: string | null | undefined, size = 'w780') =>
  path ? `${TMDB_IMG}/${size}${path}` : null;
export const logoUrl     = (path: string | null | undefined, size = 'w45') =>
  path ? `${TMDB_IMG}/${size}${path}` : null;
