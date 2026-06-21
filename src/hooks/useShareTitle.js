import { useCallback } from 'react';
import { useShare } from './useShare.js';
import { buildTitleShareUrl } from '../utils/share.js';

/**
 * Share a title (movie or show) from any surface. Thin wrapper over useShare
 * that builds the canonical /save deep link and tags a `title_shared` event.
 *
 * Returns { shareTitle, copied }:
 *  - shareTitle({ tmdbId, mediaType, title, source }) opens the native share
 *    sheet or copies the link.
 *  - copied flips true briefly after a clipboard fallback (transient "Copied!").
 */
export function useShareTitle() {
  const { share, copied } = useShare();

  const shareTitle = useCallback(({ tmdbId, mediaType, title, source = 'share' } = {}) => {
    const url = buildTitleShareUrl({ tmdbId, mediaType, source });
    if (!url) return Promise.resolve({ ok: false, method: 'unavailable' });
    return share({
      url,
      title: title || undefined,
      text: title ? `${title} — found on PLOT` : undefined,
      event: 'title_shared',
      eventProps: { tmdb_id: Number(tmdbId), media_type: mediaType, source },
    });
  }, [share]);

  return { shareTitle, copied };
}
