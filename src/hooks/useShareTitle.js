import { useCallback, useEffect, useRef, useState } from 'react';
import { usePostHog } from '@posthog/react';
import { buildTitleShareUrl, shareUrl } from '../utils/share.js';

const COPIED_RESET_MS = 2000;

/**
 * Share a title (movie or show) from any surface.
 *
 * Returns { shareTitle, copied }:
 *  - shareTitle({ tmdbId, mediaType, title, source }) opens the native share
 *    sheet or copies the link, and fires a `title_shared` analytics event.
 *  - copied flips true for a couple of seconds after a clipboard fallback, so
 *    the caller can show a transient "Copied!" state.
 */
export function useShareTitle() {
  const posthog = usePostHog();
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const shareTitle = useCallback(async ({ tmdbId, mediaType, title, source = 'share' } = {}) => {
    const url = buildTitleShareUrl({ tmdbId, mediaType, source });
    if (!url) return { ok: false, method: 'unavailable' };

    const result = await shareUrl({
      url,
      title: title || undefined,
      text: title ? `${title} — found on PLOT` : undefined,
    });

    if (result.ok) {
      posthog?.capture('title_shared', {
        tmdb_id: Number(tmdbId),
        media_type: mediaType,
        method: result.method,
        source,
      });
      if (result.method === 'copy') {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
      }
    }

    return result;
  }, [posthog]);

  return { shareTitle, copied };
}
