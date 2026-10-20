// Where to watch prompt for a film with no offer in the viewer's region.
// Turns on the existing streaming-arrival alert: the caller saves the film
// (the watchlist is the opt-in) and enableStreamingArrivalAlert clears a mute
// and the watchlist-wide off switch. TV has no such alert, so MediaPanel only
// mounts this for a movie. Nothing here sends a notification.
import { useState } from 'react';
import { enableStreamingArrivalAlert } from '@plot/core/useStreamingAlerts.js';
import { STREAMING_ALERTS as A } from '@plot/core/copy/streamingAlerts.js';
import { COMMON } from '../copy/common.js';
import { track, EVENTS } from '../lib/analytics.js';
import './StreamingArrivalAsk.css';

/** Presentational. `onAsk` is omitted once `armed` is set. */
export function StreamingArrivalAskView({ armed, busy, failed, onAsk }) {
  if (armed) return <p className="streaming-arrival-armed">{A.ask.armed}</p>;
  return (
    <div className="streaming-arrival-ask">
      <button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={onAsk}>
        {busy ? COMMON.saving : A.ask.prompt}
      </button>
      {failed && <p className="streaming-arrival-error" role="alert">{A.error}</p>}
    </div>
  );
}

/**
 * @param {{
 *   userId: string | null | undefined,
 *   movie: { id: number, title?: string } | null | undefined,
 *   inList: boolean,
 *   onAdd: () => Promise<unknown>,
 * }} props
 */
export default function StreamingArrivalAsk({ userId, movie, inList, onAdd }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!userId || !movie?.id || !movie?.title) return null;

  const onAsk = async () => {
    if (busy || armed) return;
    setBusy(true);
    setFailed(false);
    try {
      if (!inList) {
        const saved = await onAdd();
        if (!saved) {
          setFailed(true);
          return;
        }
      }
      const result = await enableStreamingArrivalAlert(userId, movie);
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setArmed(true);
      track(EVENTS.STREAMING_ARRIVAL_REQUESTED, {
        tmdb_id: Number(movie.id),
        added_to_watchlist: !inList,
      });
    } finally {
      setBusy(false);
    }
  };

  return <StreamingArrivalAskView armed={armed} busy={busy} failed={failed} onAsk={onAsk} />;
}
