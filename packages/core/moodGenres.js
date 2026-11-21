// The mood chips Just Decide and Watch together share, and the TMDB genres
// behind each one. Ids are TMDB's fixed genre catalog ids (the same ones
// FEATURED_GENRES in tonightPicker.js uses), not title ids. Negative ids are
// the picker's keyword-backed show genres: TMDB has no Romance, Thriller or
// Horror genre for TV, so the picker resolves those through TMDB keywords.
// No imports, so any module can read this without side effects.

/**
 * Genres behind each mood chip, per type. The sets do not overlap, so one
 * chip never lights another. Negative ids are keyword-backed show genres.
 */
export const MOOD_GENRES = {
  funny: { movie: [35], tv: [35] },
  romantic: { movie: [10749], tv: [-10749] },
  gripping: { movie: [53, 80, 9648], tv: [80, 9648, -53] },
  scary: { movie: [27], tv: [-27] },
  moving: { movie: [18], tv: [18] },
  adventurous: { movie: [12, 28], tv: [10759] },
  mindBending: { movie: [878], tv: [10765] },
  trueStory: { movie: [99], tv: [99] },
  animated: { movie: [16], tv: [16] },
};

/** @typedef {keyof typeof MOOD_GENRES} Mood */

/** Mood chips, in the order the row shows them. */
export const MOODS = /** @type {Mood[]} */ (Object.keys(MOOD_GENRES));
