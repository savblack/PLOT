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

/** Username rule shared by the availability check on both platforms. */
export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

/** @param {string} value */
export function normaliseUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}
