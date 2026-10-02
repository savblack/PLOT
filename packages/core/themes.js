/**
 * Appearance themes: a FAMILY (the free default, or a Premium family such as
 * Sage) in a MODE (light, dark, or system, which follows the device). Which
 * families exist, which need Premium, how an old saved value migrates and what
 * a preference resolves to all live here, platform-agnostic, so mobile can
 * adopt the same rules. Colour VALUES live in tokens.js (`themeFamilies`,
 * next to the base colours).
 *
 * The mode is always free. A Premium family falls back to the default family
 * (same mode) once the viewer is known not to have Premium. The stored
 * preference itself is never rewritten by that fallback: the entitlement read
 * returns false on a network error, so overwriting would throw away a paying
 * member's pick on a bad connection, and a member who lapses and resubscribes
 * gets their family back.
 *
 * Storage (web): 'plot-theme' holds the mode, as it always has, and
 * 'plot-theme-family' the family. An older 'plot-theme' that holds a retired
 * single theme id ('sage', 'midnight', 'espresso'…) migrates via LEGACY_THEMES,
 * and a renamed family id in 'plot-theme-family' via FAMILY_ALIASES.
 *
 * Web applies a preference as data-theme="<light|dark>" (so every existing
 * [data-theme="dark"] rule keeps working) plus data-palette="<family>" (absent
 * for the default family); see apps/web/src/hooks/useTheme.js and the
 * pre-paint script in apps/web/index.html, which carries a generated copy of
 * the family list and LEGACY_THEMES because it runs before any module loads.
 */
import { colors, themeFamilies } from './tokens.js';

/** @typedef {'light' | 'dark' | 'system'} ThemeMode */
/** @typedef {keyof typeof themeFamilies} PremiumFamily */
/** @typedef {'default' | PremiumFamily} ThemeFamily */
/** @typedef {{ family: ThemeFamily, mode: ThemeMode }} ThemePreference */

export const THEME_STORAGE_KEY = 'plot-theme';
export const THEME_FAMILY_STORAGE_KEY = 'plot-theme-family';
export const DEFAULT_FAMILY = 'default';

/** @type {readonly ThemeMode[]} */
export const THEME_MODES = Object.freeze(['light', 'dark', 'system']);

/** @type {readonly PremiumFamily[]} */
export const PREMIUM_FAMILIES = Object.freeze(/** @type {PremiumFamily[]} */ (Object.keys(themeFamilies)));

/** Every family in picker order: the free default first. */
/** @type {readonly ThemeFamily[]} */
export const THEME_FAMILIES = Object.freeze([DEFAULT_FAMILY, ...PREMIUM_FAMILIES]);

/**
 * Single theme ids that earlier builds stored in 'plot-theme', and the
 * preference each becomes. Cinema and Midnight were the dark sides of Sage and
 * Mist; the retired warm families fall back to the default in the same mode.
 * @type {Readonly<Record<string, ThemePreference>>}
 */
export const LEGACY_THEMES = Object.freeze({
  sage: { family: 'sage', mode: 'light' },
  cinema: { family: 'sage', mode: 'dark' },
  mist: { family: 'mist', mode: 'light' },
  midnight: { family: 'mist', mode: 'dark' },
  ink: { family: 'ink', mode: 'light' },
  linen: { family: 'default', mode: 'light' },
  espresso: { family: 'default', mode: 'dark' },
  clay: { family: 'default', mode: 'dark' },
  burgundy: { family: 'default', mode: 'dark' },
  rose: { family: 'blush', mode: 'light' },
});

/**
 * Renamed family ids and what a stored 'plot-theme-family' becomes. Rose was
 * renamed Blush before it shipped (2 Oct 2026); kept so a preview build's
 * saved choice still lands.
 * @type {Readonly<Record<string, ThemeFamily>>}
 */
export const FAMILY_ALIASES = Object.freeze({ rose: 'blush' });

const has = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);

/** @param {unknown} id */
export function isPremiumFamily(id) {
  return has(themeFamilies, id);
}

/** @param {unknown} id */
export function isKnownFamily(id) {
  return id === DEFAULT_FAMILY || isPremiumFamily(id);
}

/** @param {unknown} mode */
export function isThemeMode(mode) {
  return THEME_MODES.includes(/** @type {ThemeMode} */ (mode));
}

/**
 * The preference stored values stand for. A retired single theme id in the
 * mode slot migrates (LEGACY_THEMES) and wins over the family slot, because it
 * predates it; anything else unrecognised becomes light / default.
 *
 * @param {unknown} storedMode    'plot-theme'
 * @param {unknown} storedFamily  'plot-theme-family'
 * @returns {ThemePreference & { migrated: boolean }} migrated: the stored
 *   values should be rewritten to this preference.
 */
export function readThemePreference(storedMode, storedFamily) {
  if (has(LEGACY_THEMES, storedMode)) return { ...LEGACY_THEMES[/** @type {string} */ (storedMode)], migrated: true };
  const aliased = has(FAMILY_ALIASES, storedFamily);
  const family = aliased ? FAMILY_ALIASES[/** @type {string} */ (storedFamily)] : storedFamily;
  return {
    family: isKnownFamily(family) ? /** @type {ThemeFamily} */ (family) : DEFAULT_FAMILY,
    mode: isThemeMode(storedMode) ? /** @type {ThemeMode} */ (storedMode) : 'light',
    migrated: aliased,
  };
}

/**
 * Whether someone may pick `family`. `isPremium` is the viewer's entitlement:
 * true, false, or null/undefined while it is still loading. Only a confirmed
 * true unlocks a Premium family, so a picker never grants one on a guess.
 *
 * @param {unknown} family
 * @param {boolean | null | undefined} isPremium
 */
export function canUseFamily(family, isPremium) {
  if (!isKnownFamily(family)) return false;
  return !isPremiumFamily(family) || isPremium === true;
}

/**
 * The family to show. A Premium family is kept while the entitlement is
 * unknown (so a member's theme does not flicker off while the profile loads)
 * and drops to the default once the viewer is known not to have Premium.
 *
 * @param {unknown} family
 * @param {boolean | null | undefined} isPremium
 * @returns {ThemeFamily}
 */
export function effectiveFamily(family, isPremium) {
  if (!isKnownFamily(family)) return DEFAULT_FAMILY;
  if (isPremiumFamily(family) && isPremium === false) return DEFAULT_FAMILY;
  return /** @type {ThemeFamily} */ (family);
}

/**
 * What to put on the document: the resolved light/dark mode every
 * [data-theme] rule keys off, and the family's palette id (null for default).
 *
 * @param {{ family?: unknown, mode?: unknown }} preference  an effective one
 * @param {boolean} systemPrefersDark
 * @returns {{ mode: 'light' | 'dark', palette: PremiumFamily | null }}
 */
export function themeAttributes({ family, mode }, systemPrefersDark) {
  const resolved = mode === 'dark' || (mode === 'system' && systemPrefersDark) ? 'dark' : 'light';
  return { mode: resolved, palette: isPremiumFamily(family) ? /** @type {PremiumFamily} */ (family) : null };
}

/**
 * Every colour token one family resolves to in one mode (the base with the
 * family's variant on top), for pickers that draw a miniature of it.
 *
 * @param {ThemeFamily} family
 * @param {'light' | 'dark'} mode
 * @returns {Record<keyof typeof colors.light, string>}
 */
export function themeColors(family, mode) {
  const base = mode === 'dark' ? { ...colors.light, ...colors.dark } : { ...colors.light };
  return isPremiumFamily(family) ? { ...base, ...themeFamilies[/** @type {PremiumFamily} */ (family)][mode] } : base;
}

/**
 * A family's swatch: its light and dark halves, each a ground, a surface, a
 * line of ink, a hairline, the type-and-line accent and the accent fill (a
 * light variant's fill is pale against its ground, so pickers draw it on the
 * surface card, never as a line).
 *
 * @param {ThemeFamily} family
 */
export function familySwatch(family) {
  const half = (mode) => {
    const c = themeColors(family, mode);
    return { bg: c.bg, surface: c.surface, text: c.textPrimary, border: c.borderStrong, accent: c.accent, fill: c.accentFill };
  };
  return { light: half('light'), dark: half('dark') };
}
