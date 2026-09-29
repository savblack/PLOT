import { useEffect, useRef, useState } from 'react';
import { on, HISTORY_CHANGED_EVENT } from '@plot/core/events.js';
import { fetchWatchDays, streakMoment } from '@plot/core/shareMoments.js';
import { requestShareCard, CARD_IDS } from '@plot/core/shareCards.js';
import { useApp } from '../hooks/useApp.js';
import { readStorage, writeStorage } from '../utils/storage.js';
import { SHARE_CARDS as T } from '../copy/shareCards.js';
import './StreakToast.css';

/* The streak moment (path 3 in docs/design/share-cards.md). After any
   history write, look at the last 400 days of watch dates and, if today
   completes a 7, 14, 30 or every-30 streak, offer the card once. Storage
   remembers the milestone and the day so a second write today, or a
   reload, does not offer it again. Web-only for the toast and the storage;
   the check itself is core. */

const STORAGE_KEY = 'plot-streak-announced';
const SHOW_MS = 9000;

export default function StreakToast() {
  const { user } = useApp();
  const [moment, setMoment] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;
    const check = async () => {
      const rows = await fetchWatchDays(user.id);
      if (!alive) return;
      const m = streakMoment(rows);
      if (!m) return;
      const stamp = `${m.days}:${m.day}`;
      if (readStorage(STORAGE_KEY) === stamp) return;
      writeStorage(STORAGE_KEY, stamp);
      setMoment(m);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMoment(null), SHOW_MS);
    };
    const off = on(HISTORY_CHANGED_EVENT, () => { check(); });
    return () => { alive = false; off(); if (timer.current) clearTimeout(timer.current); };
  }, [user?.id]);

  if (!moment) return null;
  return (
    <StreakToastView
      days={moment.days}
      onShare={() => { setMoment(null); requestShareCard({ card: CARD_IDS.STREAK, source: 'streak-toast' }); }}
      onDismiss={() => setMoment(null)}
    />
  );
}

/** The toast itself, for the story and for the host above. */
export function StreakToastView({ days, onShare, onDismiss }) {
  return (
    <div className="streak-toast" role="status" aria-live="polite">
      <span className="streak-toast-message">{T.streakToast(days)}</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={onShare}>{T.shareIt}</button>
      <button type="button" className="streak-toast-close" aria-label={T.dismiss} onClick={onDismiss}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
