import { useCallback, useEffect, useState } from 'react';
import { discoverByKeyword } from './browse.js';

/**
 * Titles for one keyword. `items` is null until the first answer; `error` is
 * true when TMDB could not be reached, so the page can offer a retry instead
 * of claiming the keyword is empty.
 * @param {'movie'|'tv'|undefined} mediaType
 * @param {number|undefined} keywordId
 * @returns {{ items: any[] | null, error: boolean, retry: () => void }}
 */
export function useKeywordBrowse(mediaType, keywordId) {
  const [state, setState] = useState({ key: null, items: null, error: false });
  const [attempt, setAttempt] = useState(0);
  const key = mediaType && keywordId ? `${mediaType}:${keywordId}:${attempt}` : null;

  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    discoverByKeyword(mediaType, keywordId)
      .then(items => { if (alive) setState({ key, items, error: items === null }); })
      .catch(() => { if (alive) setState({ key, items: null, error: true }); });
    return () => { alive = false; };
  }, [key, mediaType, keywordId]);

  const retry = useCallback(() => setAttempt(n => n + 1), []);
  // A result for a previous keyword is not this keyword's result.
  const current = state.key === key;
  return { items: current ? state.items : null, error: current && state.error, retry };
}
