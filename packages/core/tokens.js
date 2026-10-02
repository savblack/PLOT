// Canonical cross-platform design-token VALUES (colors + radii). Source of truth
// for both apps: the web app's CSS custom properties are validated against this
// (`npm run tokens:check`), and mobile derives its StyleSheet token objects from
// it. Platform-specific presentation — fonts, shadows, motion, glass, layout
// constants, spacing, font sizes — stays in each app, since those don't map 1:1
// between DOM/CSS and React Native.
//
// `light` is the full set (web :root). `dark` holds only the values the web
// [data-theme="dark"] block overrides; anything absent inherits from `light`.

// The type-and-line accent's text shade, named once because star ratings use
// it too (rating below, decision 2 Oct 2026).
const LIGHT_ACCENT_TEXT = '#B83558';
const DARK_ACCENT_TEXT = '#F06A88';

export const colors = {
  light: {
    // Warm neutrals (Sept 2026 brand pass). Cream ground, near-white warm
    // surfaces, a deeper cream for sunken areas and cards, soft charcoal ink.
    // Every text token clears 4.5:1 on --bg AND on --surface-sunken, since
    // cards are the sunken cream and carry body text.
    bg: '#F8F2EA',
    surface: '#FFFCF7',
    surfaceRaised: '#FFFFFF',
    surfaceSunken: '#F1E9DC',
    textPrimary: '#292924',
    textSecondary: '#5F5A52',
    // 4.78:1 on the sunken cream, 5.2 on --bg. Muted carries empty states,
    // hints, timestamps, counts and the TMDB credit, none of which are the
    // inactive controls WCAG exempts, so it has to clear the bar like any
    // other text.
    textMuted: '#6B655D',
    imageScrim: 'rgba(20,18,16,0.6)',
    imageTextPrimary: '#F8F2EA',
    imageTextSecondary: '#F1E9DC',
    border: 'rgba(41,41,36,0.08)',
    borderStrong: 'rgba(41,41,36,0.16)',
    accent: '#E05578',
    accentDim: 'rgba(224,85,120,0.12)',
    // The ACCENT is a soft green (the deep end of Marshmallow's sage) for type
    // and line: small text, icons, rank numbers, rings, the active tab. 4.91:1
    // on --bg and 4.53:1 on the sunken cream. accentText is a step darker for
    // the smallest labels. Green replaced the pink accent on 16 Sep 2026; the
    // pink lives on as the fill below.
    accentText: LIGHT_ACCENT_TEXT,
    // The SECONDARY accent is a soft green (the deep end of Marshmallow's
    // sage): availability, "now at home", a second voice next to the pink.
    // 4.91:1 on --bg, 4.53:1 on the sunken cream. accentSecondaryFill is the
    // sage tint it sits on as a chip.
    accentSecondary: '#5F7030',
    accentSecondaryDim: 'rgba(95,112,48,0.12)',
    accentSecondaryFill: '#DBE1B0',
    // The FILL: the brand pink. Too light to carry text (1.97:1 on cream), so
    // it only ever sits behind charcoal text (6.69:1): the primary button,
    // chips, the Live badge, the sign-up pill.
    accentFill: '#FF88C8',
    accentFillHover: '#FF9FD3',
    onAccentFill: '#292924',
    // Text on the sage chip (accentSecondaryFill). The same charcoal as
    // onAccentFill here; a Premium theme can have a dark accent fill with white
    // text (Ink), where the light sage chip still needs dark text.
    onAccentSecondaryFill: '#292924',
    // The fill when it sits on artwork (a chip or stamp over a poster or
    // backdrop). The accent fill everywhere but Ink, whose black fill would
    // vanish on a dark image; it uses white with ink text there instead.
    artworkFill: '#FF88C8',
    artworkFillHover: '#FF9FD3',
    onArtworkFill: '#292924',
    // A marker stroke behind body text (Pick for Me's finding sentence). The
    // accent fill, except where that fill is too dark to read text over.
    highlight: '#FF88C8',
    danger: '#B9384A',
    dangerDim: 'rgba(185,56,74,0.1)',
    dangerBorder: 'rgba(185,56,74,0.22)',
    epgBarStream: '#F0AABC',
    epgBarBroadcast: '#93c5fd',
    chipNow: '#059669',
    chipToday: '#059669',
    chipTomorrow: '#D97706',
    chipSoon: '#D97706',
    chipCinema: '#D95C66',
    chipStreaming: '#68AFA8',
    chipEpisode: '#6D68D9',
    // Watch-state signals on the media panel's status and save buttons. Both
    // were hardcoded Tailwind defaults tuned for the dark panel: in light mode
    // the label sat at 2.6:1 against its own fill, and "watched" was a
    // near-black block on white. Each pair clears 4.5:1 against its own dim
    // fill in its own theme. The dark values are the ones already in use, so
    // dark mode is unchanged and only light gains a real counterpart.
    statusWatching: '#5852C9',
    statusWatchingDim: 'rgba(88,82,201,0.12)',
    statusWatched: '#047857',
    statusWatchedDim: 'rgba(4,120,87,0.12)',
    // Outcome of an operation (the toast's tick, the import's "have" badge),
    // which is a different thing from a title's watch state even though the
    // two currently resolve to the same green — the same deliberate overlap
    // as badgeSupporter and accent below. Keeping them separate means either
    // can move without dragging the other with it. Was #4ade80 inline in both
    // apps, which measured 1.66:1 in light mode.
    success: '#047857',
    successDim: 'rgba(4,120,87,0.08)',
    successBorder: 'rgba(4,120,87,0.3)',
    // Profile badges. Two distinct things, so two distinct colours: blue =
    // paid Premium (entitlement), pink = Ko-fi supporter (recognition). Pink
    // tracks the accent ladder; blue is its own hue so the two never read as
    // shades of one badge.
    // The star rating, shared by both apps: every star and score is the
    // theme's accentText (decision 2 Oct 2026), an approved accent use. It
    // replaced an amber that no longer belonged to any theme. 4.73:1 on the
    // sunken cream, the lowest of the four grounds. Premium families get the
    // same rule below, so rating is never set per family.
    rating: LIGHT_ACCENT_TEXT,
    badgePremium: '#1A8CD8',
    badgeSupporter: '#E05578',
  },
  dark: {
    // Warm-neutral scale anchored on the brand/editorial dark (#0c0c0c / #f0efe8),
    // shared with the marketing site and the error screens. Even L* ladder
    // bg→sunken→surface→raised; text/borders are warm tints of the off-white.
    bg: '#0c0c0c',
    surface: '#191919',
    surfaceRaised: '#242424',
    surfaceSunken: '#111111',
    textPrimary: '#f0efe8',
    textSecondary: '#a8a69c',
    textMuted: '#919085',
    border: 'rgba(240,239,232,0.08)',
    borderStrong: 'rgba(240,239,232,0.16)',
    accent: '#F06A88',
    accentDim: 'rgba(240,106,136,0.15)',
    accentText: DARK_ACCENT_TEXT,
    // The green lightened for the dark ground (12.4:1).
    accentSecondary: '#C9D48A',
    accentSecondaryDim: 'rgba(201,212,138,0.15)',
    accentSecondaryFill: '#DBE1B0',
    // The green lightened for the dark ground (12.4:1); the fill is the same pink.
    accentFill: '#FF88C8',
    accentFillHover: '#FF9FD3',
    onAccentFill: '#292924',
    danger: '#F18997',
    dangerDim: 'rgba(241,137,151,0.16)',
    dangerBorder: 'rgba(241,137,151,0.26)',
    epgBarStream: '#9a4960',
    epgBarBroadcast: '#60a5fa',
    chipCinema: '#E16A73',
    chipStreaming: '#78BDB7',
    chipEpisode: '#7A75E0',
    statusWatching: '#818cf8',
    statusWatchingDim: 'rgba(99,102,241,0.12)',
    statusWatched: '#4ade80',
    statusWatchedDim: '#0d2d1a',
    success: '#4ade80',
    successDim: 'rgba(74,222,128,0.08)',
    successBorder: 'rgba(74,222,128,0.35)',
    rating: DARK_ACCENT_TEXT,
    badgePremium: '#1D9BF0',
    badgeSupporter: '#F06A88',
  },
};

// Premium theme families (PLO-523, values final 29 Sep 2026). Each family has a light and a dark
// variant, picked by the same Light / Dark / System control as the free
// default, and each variant overrides the ground, ink and hairline tokens plus
// its own accent set on top of the matching base (colors.light or colors.dark
// merged). The accent keeps exactly the roles in
// docs/design/shared-design-system.md; only the hue is per family. Object
// order is the order pickers list them; names live in the copy catalog
// (SETTINGS_VIEW.appearance.families).
//
// The web app renders these as :root[data-palette="<family>"][data-theme="<mode>"]
// blocks in tokens.css (generated by scripts/build-tokens.mjs, as is the family
// list in apps/web/index.html), so every [data-theme="dark"] rule still
// applies. tests/unit/themes.test.js holds every variant to: each text token
// >= 4.5:1 on bg, surface, raised and sunken; the text on each fill >= 4.5:1;
// accent >= 3:1 on bg. Gating, migration and resolution live in themes.js.
//
// Extra fill tokens every variant carries (and the free themes define in
// colors.light): artworkFill / onArtworkFill for a fill over a poster or
// backdrop (Ink's black fill would vanish on a dark image), onAccentSecondaryFill
// for text on the sage chip, highlight for a marker stroke behind body text.
export const themeFamilyVariants = {
  sage: {
    light: {
      bg: '#E3EACA',
      surface: '#EDF2DA',
      surfaceRaised: '#F7F9EE',
      surfaceSunken: '#D8E1BA',
      textPrimary: '#20261A',
      textSecondary: '#454F33',
      textMuted: '#4B5638',
      border: 'rgba(32,38,26,0.1)',
      borderStrong: 'rgba(32,38,26,0.18)',
      accent: '#4F7A1A',
      accentDim: 'rgba(79,122,26,0.12)',
      accentText: '#3F6314',
      accentFill: '#BFDA5E',
      accentFillHover: '#CBE276',
      onAccentFill: '#20261A',
      accentSecondary: '#7A3D62',
      accentSecondaryDim: 'rgba(122,61,98,0.12)',
      accentSecondaryFill: '#EED3E2',
      onAccentSecondaryFill: '#20261A',
      artworkFill: '#BFDA5E',
      artworkFillHover: '#CBE276',
      onArtworkFill: '#20261A',
      highlight: '#BFDA5E',
      danger: '#932636',
      statusWatching: '#4640AE',
      statusWatched: '#035E45',
      success: '#035E45',
    },
    dark: {
      bg: '#0E1A11',
      surface: '#152419',
      surfaceRaised: '#1F3223',
      surfaceSunken: '#09120B',
      textPrimary: '#E8F0DE',
      textSecondary: '#AFC1A2',
      textMuted: '#97AB89',
      border: 'rgba(232,240,222,0.09)',
      borderStrong: 'rgba(232,240,222,0.17)',
      accent: '#B7D65A',
      accentDim: 'rgba(183,214,90,0.16)',
      accentText: '#B7D65A',
      accentFill: '#BFDA5E',
      accentFillHover: '#CBE276',
      onAccentFill: '#18200F',
      accentSecondary: '#E6AFCF',
      accentSecondaryDim: 'rgba(230,175,207,0.15)',
      accentSecondaryFill: '#EED3E2',
      onAccentSecondaryFill: '#18200F',
      artworkFill: '#BFDA5E',
      artworkFillHover: '#CBE276',
      onArtworkFill: '#18200F',
      highlight: '#BFDA5E',
    },
  },
  mist: {
    light: {
      bg: '#E1E8EE',
      surface: '#EBF0F4',
      surfaceRaised: '#F7FAFC',
      surfaceSunken: '#D5DEE6',
      textPrimary: '#1B232A',
      textSecondary: '#414E59',
      textMuted: '#475461',
      border: 'rgba(27,35,42,0.1)',
      borderStrong: 'rgba(27,35,42,0.18)',
      accent: '#2F6AA8',
      accentDim: 'rgba(47,106,168,0.12)',
      accentText: '#285C92',
      accentFill: '#A8CBEE',
      accentFillHover: '#BAD6F2',
      onAccentFill: '#1B232A',
      accentSecondary: '#8A4F14',
      accentSecondaryDim: 'rgba(138,79,20,0.12)',
      accentSecondaryFill: '#F3D9BB',
      onAccentSecondaryFill: '#1B232A',
      artworkFill: '#A8CBEE',
      artworkFillHover: '#BAD6F2',
      onArtworkFill: '#1B232A',
      highlight: '#A8CBEE',
      danger: '#932636',
      statusWatching: '#4640AE',
      statusWatched: '#035E45',
      success: '#035E45',
    },
    dark: {
      bg: '#0D141C',
      surface: '#15202B',
      surfaceRaised: '#1F2C39',
      surfaceSunken: '#090E14',
      textPrimary: '#E5EDF4',
      textSecondary: '#A6B4C2',
      textMuted: '#8D9CAB',
      border: 'rgba(229,237,244,0.09)',
      borderStrong: 'rgba(229,237,244,0.17)',
      accent: '#7FB2EA',
      accentDim: 'rgba(127,178,234,0.16)',
      accentText: '#7FB2EA',
      accentFill: '#A8CBEE',
      accentFillHover: '#BAD6F2',
      onAccentFill: '#0D141C',
      accentSecondary: '#F2B97F',
      accentSecondaryDim: 'rgba(242,185,127,0.15)',
      accentSecondaryFill: '#F3D9BB',
      onAccentSecondaryFill: '#0D141C',
      artworkFill: '#A8CBEE',
      artworkFillHover: '#BAD6F2',
      onArtworkFill: '#0D141C',
      highlight: '#A8CBEE',
    },
  },
  blush: {
    light: {
      bg: '#F6DCE3',
      surface: '#FAE8ED',
      surfaceRaised: '#FDF5F7',
      surfaceSunken: '#EDCBD5',
      textPrimary: '#2B1A20',
      textSecondary: '#5A3D47',
      textMuted: '#62444F',
      border: 'rgba(43,26,32,0.1)',
      borderStrong: 'rgba(43,26,32,0.18)',
      accent: '#1D7068',
      accentDim: 'rgba(29,112,104,0.12)',
      accentText: '#175E57',
      accentFill: '#8FD6CB',
      accentFillHover: '#A5DFD6',
      onAccentFill: '#12302C',
      accentSecondary: '#45561A',
      accentSecondaryDim: 'rgba(69,86,26,0.12)',
      accentSecondaryFill: '#DDE3B2',
      onAccentSecondaryFill: '#2B1A20',
      artworkFill: '#8FD6CB',
      artworkFillHover: '#A5DFD6',
      onArtworkFill: '#12302C',
      highlight: '#8FD6CB',
      danger: '#932636',
      statusWatching: '#4640AE',
      statusWatched: '#035E45',
      success: '#035E45',
    },
    dark: {
      bg: '#240E17',
      surface: '#311621',
      surfaceRaised: '#401E2C',
      surfaceSunken: '#1A0910',
      textPrimary: '#F9E6EC',
      textSecondary: '#D8B1BF',
      textMuted: '#C497A7',
      border: 'rgba(249,230,236,0.09)',
      borderStrong: 'rgba(249,230,236,0.17)',
      accent: '#7FD6C8',
      accentDim: 'rgba(127,214,200,0.16)',
      accentText: '#7FD6C8',
      accentFill: '#8FD6CB',
      accentFillHover: '#A5DFD6',
      onAccentFill: '#12302C',
      accentSecondary: '#C9D48A',
      accentSecondaryDim: 'rgba(201,212,138,0.15)',
      accentSecondaryFill: '#DDE3B2',
      onAccentSecondaryFill: '#12302C',
      artworkFill: '#8FD6CB',
      artworkFillHover: '#A5DFD6',
      onArtworkFill: '#12302C',
      highlight: '#8FD6CB',
    },
  },
  ink: {
    light: {
      bg: '#FAFAF8',
      surface: '#FFFFFF',
      surfaceRaised: '#FFFFFF',
      surfaceSunken: '#EDEDE9',
      textPrimary: '#111111',
      textSecondary: '#383836',
      textMuted: '#474744',
      border: 'rgba(17,17,17,0.14)',
      borderStrong: 'rgba(17,17,17,0.3)',
      accent: '#C92A2A',
      accentDim: 'rgba(201,42,42,0.12)',
      accentText: '#B32424',
      accentFill: '#111111',
      accentFillHover: '#2A2A2A',
      onAccentFill: '#FFFFFF',
      accentSecondary: '#2D6A4B',
      accentSecondaryDim: 'rgba(45,106,75,0.12)',
      accentSecondaryFill: '#D3E8DB',
      onAccentSecondaryFill: '#111111',
      artworkFill: '#FFFFFF',
      artworkFillHover: '#EDEDE9',
      onArtworkFill: '#111111',
      highlight: '#F2C9C9',
    },
    dark: {
      bg: '#080808',
      surface: '#121212',
      surfaceRaised: '#1C1C1C',
      surfaceSunken: '#000000',
      textPrimary: '#FFFFFF',
      textSecondary: '#C8C8C4',
      textMuted: '#A8A8A3',
      border: 'rgba(255,255,255,0.16)',
      borderStrong: 'rgba(255,255,255,0.32)',
      accent: '#FF5147',
      accentDim: 'rgba(255,81,71,0.16)',
      accentText: '#FF6A61',
      accentFill: '#FFFFFF',
      accentFillHover: '#E8E8E4',
      onAccentFill: '#111111',
      accentSecondary: '#6FD39E',
      accentSecondaryDim: 'rgba(111,211,158,0.15)',
      accentSecondaryFill: '#D3E8DB',
      onAccentSecondaryFill: '#111111',
      artworkFill: '#FFFFFF',
      artworkFillHover: '#E8E8E4',
      onArtworkFill: '#111111',
      highlight: '#6B2A26',
    },
  },
  plum: {
    light: {
      bg: '#E7E0F2',
      surface: '#F0EBF8',
      surfaceRaised: '#FAF8FD',
      surfaceSunken: '#DBD2EC',
      textPrimary: '#221B2E',
      textSecondary: '#4A3F5C',
      textMuted: '#514563',
      border: 'rgba(34,27,46,0.1)',
      borderStrong: 'rgba(34,27,46,0.18)',
      accent: '#9A5A00',
      accentDim: 'rgba(154,90,0,0.12)',
      accentText: '#7D4800',
      accentFill: '#F2C04F',
      accentFillHover: '#F5CD6D',
      onAccentFill: '#2A1F08',
      accentSecondary: '#195A53',
      accentSecondaryDim: 'rgba(25,90,83,0.12)',
      accentSecondaryFill: '#CDE7E2',
      onAccentSecondaryFill: '#221B2E',
      artworkFill: '#F2C04F',
      artworkFillHover: '#F5CD6D',
      onArtworkFill: '#2A1F08',
      highlight: '#F2C04F',
      danger: '#932636',
      statusWatching: '#4640AE',
      statusWatched: '#035E45',
      success: '#035E45',
    },
    dark: {
      bg: '#16101F',
      surface: '#211A2D',
      surfaceRaised: '#2C233B',
      surfaceSunken: '#0F0A16',
      textPrimary: '#F0EAF8',
      textSecondary: '#BDB0D0',
      textMuted: '#A597BB',
      border: 'rgba(240,234,248,0.09)',
      borderStrong: 'rgba(240,234,248,0.17)',
      accent: '#F2C04F',
      accentDim: 'rgba(242,192,79,0.16)',
      accentText: '#F2C04F',
      accentFill: '#F2C04F',
      accentFillHover: '#F5CD6D',
      onAccentFill: '#2A1F08',
      accentSecondary: '#7FD0C4',
      accentSecondaryDim: 'rgba(127,208,196,0.15)',
      accentSecondaryFill: '#CDE7E2',
      onAccentSecondaryFill: '#2A1F08',
      artworkFill: '#F2C04F',
      artworkFillHover: '#F5CD6D',
      onArtworkFill: '#2A1F08',
      highlight: '#F2C04F',
    },
  },
};

// The families that ship, in picker order. A family in themeFamilyVariants but
// not listed here is wired (named in the copy catalog, held to the contrast bar
// by themes.test.js) but hidden from every picker.
const SHIPPED_FAMILIES = ['sage', 'mist', 'blush', 'ink', 'plum'];

// Star ratings take each variant's accentText, as on the free themes, so a
// family never carries its own rating value.
for (const family of Object.values(themeFamilyVariants)) {
  for (const variant of [family.light, family.dark]) variant.rating = variant.accentText;
}

/** @type {Record<string, { light: Record<string, string>, dark: Record<string, string> }>} */
export const themeFamilies = Object.fromEntries(SHIPPED_FAMILIES.map(id => [id, themeFamilyVariants[id]]));

export const radii = {
  md: 16,
  lg: 24,
  badge: 10,
  pill: 9999,
};

// Base-4 spacing scale (px), shared across platforms. The web app uses these
// same steps in its layout rhythm (design system §11); mobile consumes the
// numbers directly. Font SIZES are intentionally NOT shared — web uses a
// semantic rem scale, mobile a numeric px scale that don't map 1:1.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

// Maps a camelCase token key to its web CSS custom-property name.
// (surfaceRaised -> --surface-raised, epgBarStream -> --epg-bar-stream)
export function cssVarName(key) {
  return '--' + key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}
