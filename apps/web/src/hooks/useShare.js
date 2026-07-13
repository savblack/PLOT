import { useCallback, useEffect, useRef, useState } from 'react';
import { shareUrl } from '../utils/share.js';
import { track } from '../lib/analytics.js';

const COPIED_RESET_MS = 2000;

/**
 * The app-wide share primitive: open the native share sheet when available,
 * otherwise copy the link to the clipboard. Surface-agnostic — give it a URL
 * (titles, profiles, lists, …); see useShareTitle for the title-specific wrapper.
 *
 * Returns { share, copied }:
 *  - share({ url, title, text, event, eventProps }) shares/copies and, on
 *    success, fires the optional analytics `event` with { method, ...eventProps }.
 *  - copied flips true briefly after a clipboard fallback so callers can show a
 *    transient "Copied!" state. (Native-share success doesn't set it — the OS
 *    sheet is its own feedback.)
 */
export function useShare() {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const share = useCallback(async ({ url, title, text, event, eventProps } = {}) => {
    const result = await shareUrl({ url, title, text });
    if (result.ok) {
      if (event) track(event, { method: result.method, ...eventProps });
      if (result.method === 'copy') {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
      }
    }
    return result;
  }, []);

  return { share, copied };
}
