import { useCallback, useEffect, useState } from 'react';
import { fetchMonthEntries, lastMonth, monthWrapMoment } from '@plot/core/shareMoments.js';
import { readStorage, writeStorage } from '../utils/storage.js';

/* The month-wrap moment (path 3 in docs/design/share-cards.md): in the first
   week of a month, last month wrapped as a notice on the Notifications page
   with a button to share the card. Computed on the client from last month's
   rows, so it needs no server job and no notification row; a push that
   deep-links to ?share=month-wrap can come later without changing this.
   Dismissal is remembered per month. Web-only for the storage; the fetch
   and the rule are core. */

const DISMISSED_KEY = 'plot-month-wrap-dismissed';
const WINDOW_DAYS = 7;

/**
 * @param {string|null|undefined} userId
 * @param {Date} [now]
 * @returns {{ moment: object|null, dismiss: () => void }}
 */
export function useMonthWrapMoment(userId, now = new Date()) {
  const [moment, setMoment] = useState(null);
  const ym = lastMonth(now);
  const key = `${ym.year}-${String(ym.month + 1).padStart(2, '0')}`;
  const inWindow = now.getDate() <= WINDOW_DAYS;
  const dismissed = readStorage(DISMISSED_KEY) === key;

  useEffect(() => {
    if (!userId || !inWindow || dismissed) return undefined;
    let alive = true;
    fetchMonthEntries(userId, ym).then(rows => {
      if (!alive) return;
      setMoment(monthWrapMoment(rows, now, { windowDays: WINDOW_DAYS }));
    });
    return () => { alive = false; };
    // ym is derived from now; key stands in for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, inWindow, dismissed, key]);

  const dismiss = useCallback(() => {
    writeStorage(DISMISSED_KEY, key);
    setMoment(null);
  }, [key]);

  return { moment, dismiss };
}
