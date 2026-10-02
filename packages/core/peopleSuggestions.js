/**
 * Suggested people for Home's Your people invite (shown to Premium members who
 * follow nobody yet): four people from titles they have logged, at least one
 * of them a director (or a show's creator).
 *
 * Pure: the caller passes TMDB details (with credits) for the logged titles.
 */

const TOP_BILLING = 6;

/**
 * @typedef {object} Suggestion
 * @property {number} id            TMDB person id, from the credits passed in
 * @property {string} name
 * @property {string | null} profilePath
 * @property {'acted' | 'directed'} kind
 * @property {number} count         logged titles they are in
 * @property {string} title         one of them, for "In Slow Horses"
 */

/**
 * @param {Array<any>} titles TMDB movie details (credits) or TV details (aggregate_credits, created_by)
 * @param {{ exclude?: Set<number>, limit?: number }} [opts] exclude: people already followed
 * @returns {Suggestion[]}
 */
export function suggestPeople(titles, { exclude = new Set(), limit = 4 } = {}) {
  /** @type {Map<number, Suggestion & { score: number }>} */
  const acted = new Map();
  /** @type {Map<number, Suggestion & { score: number }>} */
  const directed = new Map();
  const add = (map, person, kind, title, score) => {
    if (!person || typeof person.id !== 'number' || !person.name || exclude.has(person.id)) return;
    const existing = map.get(person.id);
    if (existing) {
      existing.count += 1;
      existing.score += score;
      return;
    }
    map.set(person.id, { id: person.id, name: person.name, profilePath: person.profile_path ?? null, kind, count: 1, title, score });
  };

  for (const t of titles ?? []) {
    const title = t?.title || t?.name;
    if (!title) continue;
    const cast = t.credits?.cast ?? t.aggregate_credits?.cast ?? [];
    for (const person of cast.slice(0, TOP_BILLING)) {
      // Lead billing weighs more than a supporting part.
      add(acted, person, 'acted', title, TOP_BILLING - (Number(person.order) || 0));
    }
    const makers = t.credits
      ? (t.credits.crew ?? []).filter((/** @type {any} */ c) => c.job === 'Director')
      : (t.created_by ?? []);
    for (const person of makers) add(directed, person, 'directed', title, TOP_BILLING);
  }

  const rank = (/** @type {Suggestion & { score: number }} */ a, /** @type {Suggestion & { score: number }} */ b) =>
    b.count - a.count || b.score - a.score || a.name.localeCompare(b.name);
  const directors = [...directed.values()].sort(rank);
  const actors = [...acted.values()].filter(p => !directed.has(p.id)).sort(rank);

  /** @type {Array<Suggestion & { score: number }>} */
  const picked = [];
  if (directors[0]) picked.push(directors[0]);
  const rest = [...actors, ...directors.slice(1)].sort(rank);
  for (const p of rest) {
    if (picked.length >= limit) break;
    if (!picked.some(x => x.id === p.id)) picked.push(p);
  }
  return picked.slice(0, limit).sort(rank).map(({ score: _score, ...s }) => s);
}
