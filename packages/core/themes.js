/**
 * Appearance themes: which ones exist, which need Premium, and what a stored
 * choice resolves to. Platform-agnostic so mobile can adopt the same rules;
 * palette VALUES live in tokens.js (`premiumPalettes`), next to the base colours.
 *
 * Light, dark and system are free. The Premium palettes each sit on a light
 * or dark base, and that base is where a palette falls back to when Premium
 * is not (or no longer) active. The stored choice itself is never rewritten
 * by the fallback: the entitlement read returns false on a network error, so
 * overwriting would throw away a paying member's pick on a bad connection,
 * and a member who lapses and resubscribes gets their theme back.
 *
 * Web applies a theme as data-theme="<light|dark>" plus data-palette="<id>"
 * (see apps/web/src/hooks/useTheme.js and the pre-paint script in
 * apps/web/index.html, which duplicates the id → base map below because it
 * runs before any module loads; tests/unit/themes.test.js keeps them equal).
 */
import { premiumPalettes } from './tokens.js';

/** @typedef {'light' | 'dark' | 'system'} BaseTheme */
/** @typedef {keyof typeof premiumPalettes} PremiumTheme */
/** @typedef {BaseTheme | PremiumTheme} ThemeId */

export const THEME_STORAGE_KEY = 'plot-theme';

/** @type {readonly BaseTheme[]} */
export const BASE_THEMES = Object.freeze(['light', 'dark', 'system']);

/** @type {readonly PremiumTheme[]} */
export const PREMIUM_THEMES = Object.freeze(/** @type {PremiumTheme[]} */ (Object.keys(premiumPalettes)));

/** @param {unknown} id */
export function isPremiumTheme(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(premiumPalettes, id);
}

/** @param {unknown} id */
export function isKnownTheme(id) {
  return BASE_THEMES.includes(/** @type {BaseTheme} */ (id)) || isPremiumTheme(id);
}

/**
 * A stored value, cleaned: anything unrecognised (a renamed palette, a
 * hand-edited localStorage) becomes 'light', the app's long-standing default.
 *
 * @param {unknown} id
 * @returns {ThemeId}
 */
export function normalizeTheme(id) {
  return isKnownTheme(id) ? /** @type {ThemeId} */ (id) : 'light';
}

/**
 * The free theme a choice falls back to: a palette's light/dark base, or the
 * choice itself when it is already free.
 *
 * @param {unknown} id
 * @returns {BaseTheme}
 */
export function themeBase(id) {
  const theme = normalizeTheme(id);
  return isPremiumTheme(theme) ? premiumPalettes[/** @type {PremiumTheme} */ (theme)].base : /** @type {BaseTheme} */ (theme);
}

/**
 * Whether someone may pick `id`. `isPremium` is the viewer's entitlement:
 * true, false, or null/undefined while it is still loading. Only a confirmed
 * true unlocks a palette, so a picker never grants one on a guess.
 *
 * @param {unknown} id
 * @param {boolean | null | undefined} isPremium
 */
export function canUseTheme(id, isPremium) {
  if (!isKnownTheme(id)) return false;
  return !isPremiumTheme(id) || isPremium === true;
}

/**
 * The theme to show for a stored choice. A palette is kept while the
 * entitlement is unknown (null/undefined), so a Premium member does not see
 * their theme flicker off while the profile loads, and drops to its base once
 * the viewer is known not to have Premium.
 *
 * @param {unknown} stored
 * @param {boolean | null | undefined} isPremium
 * @returns {ThemeId}
 */
export function effectiveTheme(stored, isPremium) {
  const theme = normalizeTheme(stored);
  if (isPremiumTheme(theme) && isPremium === false) return themeBase(theme);
  return theme;
}

/**
 * What to put on the document for a theme: the light/dark mode every
 * [data-theme] rule keys off, plus the palette id (or null).
 *
 * @param {unknown} theme          an effective theme (see effectiveTheme)
 * @param {boolean} systemPrefersDark
 * @returns {{ mode: 'light' | 'dark', palette: PremiumTheme | null }}
 */
export function themeAttributes(theme, systemPrefersDark) {
  const id = normalizeTheme(theme);
  if (isPremiumTheme(id)) {
    const palette = /** @type {PremiumTheme} */ (id);
    return { mode: premiumPalettes[palette].base, palette };
  }
  if (id === 'system') return { mode: systemPrefersDark ? 'dark' : 'light', palette: null };
  return { mode: /** @type {'light' | 'dark'} */ (id), palette: null };
}

/**
 * A palette's preview colours, for a picker swatch.
 *
 * @param {PremiumTheme} id
 * @returns {{ bg: string, surface: string, text: string, border: string }}
 */
export function themeSwatch(id) {
  const { colors } = premiumPalettes[id];
  return { bg: colors.bg, surface: colors.surface, text: colors.textPrimary, border: colors.borderStrong };
}
