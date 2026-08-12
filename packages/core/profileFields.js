// The editable shape of a PLOT profile: which social links exist, and which
// content rails a user can show or hide.
//
// Both were hardcoded inside apps/web/src/pages/PublicProfilePage.jsx. Mobile's
// edit sheet needs the identical sets — a link mobile doesn't know about is a
// link a user can set on web and never see again — so the data lives here and
// each app supplies its own icons (web SVG components, RN react-native-svg).

/**
 * Fixed set of external links. Stored on `profiles.links` as
 * `{ [key]: value }`, where value is a bare handle rather than a URL — `url()`
 * turns it into one at render time so the stored value stays portable.
 *
 * @type {{ key: string, label: string, placeholder: string, url: (v: string) => string }[]}
 */
export const SOCIAL_LINKS = [
  { key: 'instagram',  label: 'Instagram',  placeholder: 'username',     url: (v) => `https://instagram.com/${v}` },
  { key: 'x',          label: 'X',          placeholder: 'username',     url: (v) => `https://x.com/${v}` },
  { key: 'tiktok',     label: 'TikTok',     placeholder: 'username',     url: (v) => `https://tiktok.com/@${v}` },
  { key: 'youtube',    label: 'YouTube',    placeholder: 'channel',      url: (v) => `https://youtube.com/@${v}` },
  { key: 'letterboxd', label: 'Letterboxd', placeholder: 'username',     url: (v) => `https://letterboxd.com/${v}` },
  { key: 'website',    label: 'Website',    placeholder: 'yoursite.com', url: (v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`) },
];

/**
 * Content rails a user can show or hide on their public profile, stored on
 * `profiles.profile_sections`. A null/absent value means "show all" — that is
 * the pre-migration default and must keep meaning that, so never persist an
 * empty array to mean the same thing.
 *
 * `favourites` is deliberately spelled -ite here because it is a storage key,
 * not display copy; the label is region-spelled at the call site.
 *
 * @type {{ key: string, label: string }[]}
 */
export const PROFILE_SECTIONS = [
  { key: 'recent',     label: 'Recently Watched' },
  { key: 'watching',   label: 'Watching' },
  { key: 'want',       label: 'Want to Watch' },
  { key: 'topMovies',  label: 'Top 10 Films' },
  { key: 'topTv',      label: 'Top 10 TV' },
  { key: 'favourites', label: 'Favorites' },
];

/** Every section key, in display order. */
export const ALL_SECTION_KEYS = PROFILE_SECTIONS.map((s) => s.key);

/**
 * Is a rail visible, given the profile's stored selection? Null/undefined means
 * the user has never chosen, which shows everything.
 *
 * @param {string[] | null | undefined} enabled
 * @param {string} key
 */
export function isSectionEnabled(enabled, key) {
  if (!enabled) return true;
  return enabled.includes(key);
}

/**
 * Username rule, shared by the availability check on both platforms.
 *
 * Hyphens, not underscores: 3-30 characters, starting and ending with an
 * alphanumeric so a handle can't lead or trail with punctuation. Web used to
 * hold two contradictory rules — SettingsView's (this one) and
 * PublicProfilePage's `/^[a-z0-9_]{3,30}$/`, which rejected hyphens. Every
 * existing handle was created under Settings' rule, and three of them contain
 * a hyphen, so this is the one that keeps them valid. No account uses an
 * underscore, so nothing needed migrating.
 */
export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/** @param {string} value */
export function normaliseUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

/* ── Writing a profile ──────────────────────────────────────────────────────
 *
 * Every profile write was open-coded at its call site: set a per-field saving
 * flag, `profiles.update(...).eq('id', userId)`, clear the flag, funnel the
 * error, re-read the profile. Eighteen copies, twelve of them in one file.
 *
 * The copies drifted where it mattered. Settings and the public profile page
 * both write `avatar_url` to the same bucket and the same path, but Settings
 * cropped to 512², re-encoded as JPEG, capped at 5MB and checked the MIME
 * type, while the profile page uploaded whatever it was handed. A 20MB HEIC
 * was rejected on one screen and accepted on the other. They also disagreed on
 * how a taken username surfaces: one read the Postgres error code, the other
 * pattern-matched the message.
 */

/** Largest avatar we accept, before cropping. */
export const AVATAR_MAX_MB = 5;

/**
 * Is this file usable as an avatar?
 * @param {{ type?: string, size?: number } | null | undefined} file
 * @param {{ maxMb?: number }} [opts]
 * @returns {{ ok: true } | { ok: false, reason: 'missing' | 'not-image' | 'too-large', maxMb: number }}
 */
export function validateAvatarFile(file, { maxMb = AVATAR_MAX_MB } = {}) {
  if (!file) return { ok: false, reason: 'missing', maxMb };
  if (!String(file.type ?? '').startsWith('image/')) return { ok: false, reason: 'not-image', maxMb };
  if (Number(file.size ?? 0) > maxMb * 1024 * 1024) return { ok: false, reason: 'too-large', maxMb };
  return { ok: true };
}

/**
 * Did this write fail because the username is taken?
 *
 * `profiles.username` is unique, so a collision arrives as 23505. Settings
 * checked the code; the profile page tested the message with /duplicate/i,
 * which is both looser (any message containing "duplicate") and tighter (it
 * misses a 23505 whose message is worded differently).
 * @param {{ code?: string, message?: string } | null | undefined} error
 */
export function isDuplicateUsernameError(error) {
  if (!error) return false;
  if (error.code === '23505') return true;
  return /duplicate key|already exists/i.test(String(error.message ?? ''));
}
