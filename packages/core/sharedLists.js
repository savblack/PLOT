/**
 * Collaborative lists, the redesign (PLO-525): which of your lists are shared,
 * who is on one and how many titles each person added, the Added by filter,
 * and which invite landing to show. Pure rules shared by web and mobile; the
 * data comes from useCustomLists.js (`role`, `people`, each item's
 * `added_by`) and useListInvites.js.
 *
 * Items keep `user_id` = the list owner (the owner foreign key needs it) and
 * record the adder in `added_by`
 * (supabase/migrations/20260927120000_watch_together_shared_lists.sql). Titles
 * the owner added before the list was shared, or through the plain owner
 * write path, have no `added_by`, so they count as the owner's.
 */

/**
 * @typedef {object} ListPerson  One row of list_shared_list_people().
 * @property {string} user_id
 * @property {string | null} [username]
 * @property {string | null} [display_name]
 * @property {string | null} [avatar_url]
 * @property {boolean} [is_owner]
 */

/**
 * @typedef {ListPerson & { isOwner: boolean, isYou: boolean, count: number }} ListMember
 */

/**
 * @typedef {object} SharedListLike
 * @property {string} id
 * @property {string} [user_id]  the owner
 * @property {'owner' | 'member'} [role]
 * @property {ListPerson[]} [people]
 * @property {{ added_by?: string | null }[]} [items]
 */

/**
 * A list counts as shared once somebody other than you is on it, or when you
 * joined someone else's. A list you own with only an invite link out stays
 * with your own lists until someone joins.
 *
 * @param {SharedListLike | null | undefined} list
 * @param {string | null | undefined} userId
 */
export function isSharedList(list, userId) {
  if (!list) return false;
  if (list.role === 'member') return true;
  return (list.people || []).some(p => p.user_id !== userId);
}

/**
 * My Lists' three groups: your own lists, the shared lists you started and
 * the ones you were invited to. Order within each group is kept.
 *
 * @template {SharedListLike} L
 * @param {L[]} lists
 * @param {string | null | undefined} userId
 * @returns {{ own: L[], sharedByMe: L[], sharedWithMe: L[] }}
 */
export function splitListsBySharing(lists, userId) {
  /** @type {{ own: L[], sharedByMe: L[], sharedWithMe: L[] }} */
  const out = { own: [], sharedByMe: [], sharedWithMe: [] };
  for (const list of lists || []) {
    if (!isSharedList(list, userId)) out.own.push(list);
    else if (list.role === 'member') out.sharedWithMe.push(list);
    else out.sharedByMe.push(list);
  }
  return out;
}

/**
 * Who added a title. Titles with no `added_by` are the owner's.
 *
 * @param {{ added_by?: string | null }} item
 * @param {string | null | undefined} ownerId
 */
export function addedById(item, ownerId) {
  return item?.added_by || ownerId || null;
}

/**
 * Everyone on a shared list with how many of its titles they added: you
 * first, then the owner, then everyone else in the order the server returned
 * them. Empty for a list nobody else is on.
 *
 * @param {SharedListLike} list
 * @param {string | null | undefined} userId
 * @returns {ListMember[]}
 */
export function listMembers(list, userId) {
  const people = list?.people || [];
  if (!people.length) return [];
  const ownerId = list.user_id || people.find(p => p.is_owner)?.user_id || null;
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const item of list.items || []) {
    const by = addedById(item, ownerId);
    if (by) counts.set(by, (counts.get(by) || 0) + 1);
  }
  const rank = (/** @type {ListPerson} */ p) => (p.user_id === userId ? 0 : p.user_id === ownerId ? 1 : 2);
  return people
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map(({ p }) => ({
      ...p,
      isOwner: p.user_id === ownerId,
      isYou: p.user_id === userId,
      count: counts.get(p.user_id) || 0,
    }));
}

/**
 * The owner of a shared list, as listed in its people, or null.
 *
 * @param {SharedListLike} list
 */
export function listOwner(list) {
  const people = list?.people || [];
  return people.find(p => p.user_id === list.user_id) || people.find(p => p.is_owner) || null;
}

/**
 * The titles one person added; everyone's when `personId` is null.
 *
 * @template {{ added_by?: string | null }} T
 * @param {T[]} items
 * @param {string | null | undefined} personId
 * @param {string | null | undefined} ownerId
 * @returns {T[]}
 */
export function filterByAddedBy(items, personId, ownerId) {
  if (!personId) return items;
  return items.filter(item => addedById(item, ownerId) === personId);
}

/**
 * The Watch together route for everyone else on a list, or null when nobody
 * else has a username yet. The Watch together page itself says when someone
 * isn't a partner yet and offers the invite.
 *
 * @param {ListMember[]} members
 */
export function watchTogetherPathFor(members) {
  const names = (members || []).filter(m => !m.isYou && m.username).map(m => encodeURIComponent(/** @type {string} */ (m.username)));
  return names.length ? `/together/with/${names.join(',')}` : null;
}

/**
 * Which invite landing to show (Savannah's pick, 2 Oct 2026): the person-led
 * version (A3, A4, A7) for a list with no titles yet, and the list-led version
 * with members and a poster peek (B3, B4, B7) once it has some.
 *
 * @param {{ item_count?: number | null } | null | undefined} info
 * @returns {'person' | 'list'}
 */
export function inviteLandingLayout(info) {
  return (info?.item_count ?? 0) > 0 ? 'list' : 'person';
}

/**
 * Names joined for a sentence: "Sam", "Sam and Priya", "Sam, Priya and Jo".
 *
 * @param {string[]} names
 */
export function joinNames(names) {
  const list = (names || []).filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}
