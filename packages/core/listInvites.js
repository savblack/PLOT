/**
 * Collaborative lists: the host needs Premium, friends join free (PLO-525).
 * Pure rules shared by web and mobile; the data calls are in useListInvites.js
 * and the server rules in
 * supabase/migrations/20260928160000_collaborative_list_invites.sql, which
 * checks Premium on the list owner, never on the person joining.
 */

/**
 * What "Invite people" does on a list for this viewer.
 *  - 'invite'            the owner has Premium: invite link plus partners to add
 *  - 'upgrade'           the owner is on Free: the upgrade sheet
 *  - 'addPartners'       a member, and the owner has Premium: add partners
 *  - 'hostNeedsPremium'  a member, and the owner is on Free (or it isn't known
 *                        yet): say so. Everyone already on the list keeps editing.
 *
 * @param {{ isOwner: boolean, viewerPremium: boolean, hostPremium?: boolean | null }} args
 * @returns {'invite' | 'upgrade' | 'addPartners' | 'hostNeedsPremium'}
 */
export function listInviteAction({ isOwner, viewerPremium, hostPremium = null }) {
  if (isOwner) return viewerPremium ? 'invite' : 'upgrade';
  return hostPremium === true ? 'addPartners' : 'hostNeedsPremium';
}

/**
 * @typedef {object} ListInvitePreview  list_invite_preview() for one key.
 * @property {string | null} list_id  only when the viewer is already on the list
 * @property {string} list_name
 * @property {number} item_count
 * @property {string} owner_id
 * @property {string} username
 * @property {string | null} display_name
 * @property {string | null} avatar_url
 * @property {boolean} host_premium
 * @property {'owner' | 'member' | 'none' | null} state  null when signed out
 */

/**
 * Which screen the invite landing page shows.
 *
 * @param {ListInvitePreview | null | undefined} info  null for an unknown key
 * @param {{ signedIn: boolean }} viewer
 * @returns {'invalid' | 'signedOut' | 'owner' | 'member' | 'inactive' | 'join'}
 */
export function listInviteLanding(info, { signedIn }) {
  if (!info) return 'invalid';
  if (!signedIn) return 'signedOut';
  if (info.state === 'owner') return 'owner';
  if (info.state === 'member') return 'member';
  // The owner is on Free: accepting would raise premium_required.
  if (!info.host_premium) return 'inactive';
  return 'join';
}
