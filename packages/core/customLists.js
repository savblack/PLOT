export function normalizeCustomListName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function findDuplicateCustomList(lists, name, excludeId = null) {
  const normalizedName = normalizeCustomListName(name);
  if (!normalizedName) return null;

  return (lists || []).find((list) => (
    list.id !== excludeId && normalizeCustomListName(list.name) === normalizedName
  )) || null;
}

/**
 * Who can read a custom list. Mirrors `public.can_view_custom_list` in
 * supabase/migrations/20260925120000_unified_profile_visibility.sql, which is
 * the enforcement; these only decide what the UI offers and says.
 *   private    owner only
 *   followers  owner and accepted followers
 *   public     whoever can see the profile, so a private profile caps it at followers
 *   link       anyone with the link; never shown on the profile or in the sitemap
 * @typedef {'private' | 'followers' | 'public' | 'link'} ListVisibility
 */

/** @type {ListVisibility[]} In the order the picker shows them. */
export const LIST_VISIBILITIES = ['private', 'followers', 'public', 'link'];

/**
 * A list's visibility. Rows written before the column existed (or by a client
 * that only knows is_public) fall back to the old boolean.
 * @param {{ visibility?: string | null, is_public?: boolean | null } | null | undefined} list
 * @returns {ListVisibility}
 */
export function listVisibility(list) {
  const v = list?.visibility;
  if (v && LIST_VISIBILITIES.includes(/** @type {ListVisibility} */ (v))) return /** @type {ListVisibility} */ (v);
  return list?.is_public ? 'public' : 'private';
}

/**
 * A share link opens for people outside the owner's followers. The share page
 * reads as a logged-out visitor, so a 'public' list only opens there when the
 * owner's profile is public too; on a private profile only 'link' does.
 * @param {ListVisibility} visibility
 * @param {boolean} profileIsPublic The OWNER's profile.is_public.
 */
export function isListShareable(visibility, profileIsPublic) {
  return visibility === 'link' || (visibility === 'public' && !!profileIsPublic);
}

/** Appears as a rail on the owner's profile (for those allowed to read it).
 * @param {ListVisibility} visibility */
export function showsOnProfile(visibility) {
  return visibility === 'public' || visibility === 'followers';
}
