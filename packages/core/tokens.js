// Canonical cross-platform design-token VALUES (colors + radii). Source of truth
// for both apps: the web app's CSS custom properties are validated against this
// (`npm run tokens:check`), and mobile derives its StyleSheet token objects from
// it. Platform-specific presentation — fonts, shadows, motion, glass, layout
// constants, spacing, font sizes — stays in each app, since those don't map 1:1
// between DOM/CSS and React Native.
//
// `light` is the full set (web :root). `dark` holds only the values the web
// [data-theme="dark"] block overrides; anything absent inherits from `light`.

export const colors = {
  light: {
    bg: '#F4F4F5',
    surface: '#FFFFFF',
    surfaceRaised: '#FAFAFA',
    surfaceSunken: '#EBEBEC',
    textPrimary: '#09090B',
    textSecondary: '#52525B',
    textMuted: '#A1A1AA',
    border: 'rgba(0,0,0,0.07)',
    borderStrong: 'rgba(0,0,0,0.14)',
    accent: '#E05578',
    accentDim: 'rgba(224,85,120,0.12)',
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
    textMuted: '#6b6a63',
    border: 'rgba(240,239,232,0.08)',
    borderStrong: 'rgba(240,239,232,0.16)',
    accent: '#F06A88',
    accentDim: 'rgba(240,106,136,0.15)',
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
    badgePremium: '#1D9BF0',
    badgeSupporter: '#F06A88',
  },
};

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
