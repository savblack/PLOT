import { useEffect, useState } from 'react';
import { tmdb } from '@plot/core/tmdb.js';

/* Fixtures shared by the History and ShareCardSheet stories. A separate
   module because every named export of a *.stories.jsx file is a story to
   Storybook, so helpers cannot live there. Titles resolve through the TMDB
   proxy at mount (never hardcoded ids). */

// The owner's Top 5s, for the share cards.
const TOP5 = {
  movies: ['Heat', 'Aftersun', 'Anatomy of a Fall', 'Paddington 2', 'Past Lives'],
  tv: ['Succession', 'Fleabag', 'The Bear', 'Severance', 'Mad Men'],
};

export const FIXTURE_PROFILE = { id: 'story', username: 'savannah', display_name: 'Savannah', region: 'AU' };

export function useFixtureTopLists() {
  const [lists, setLists] = useState({ movies: [], tv: [] });
  useEffect(() => {
    let alive = true;
    (async () => {
      const out = { movies: [], tv: [] };
      for (const kind of ['movies', 'tv']) {
        const type = kind === 'tv' ? 'tv' : 'movie';
        for (const [i, title] of TOP5[kind].entries()) {
          const hit = await tmdb.resolveTitle(title, type);
          out[kind].push({ rank: i + 1, list_type: kind, media_type: type, tmdb_id: hit?.id ?? i + 1, title: hit?.title ?? hit?.name ?? title, poster_path: hit?.poster_path ?? null });
        }
      }
      if (alive) setLists(out);
    })();
    return () => { alive = false; };
  }, []);
  return lists;
}
