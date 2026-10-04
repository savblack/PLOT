// Streaming alerts on a film that is on your watchlist (title panel). Free, in
// the app, automatic: the watchlist is the opt-in, so this card only shows once
// the film is on it, and what it offers is a way out (mute this film), not a
// way in. Turning the whole thing off lives in Settings; if it is off, one tap
// here puts it back.
//
// Logic: @plot/core/useStreamingAlerts.js. Detection and delivery happen
// server-side in the streaming-arrival-alerts Edge Function.
//
// Mobile parity: not shipped on mobile yet (issue 1093); mobile already renders
// the streaming_arrival notification row.
import { useApp } from '../hooks/useApp.js';
import { useStreamingAlertMute, useStreamingAlertsSwitch } from '@plot/core/useStreamingAlerts.js';
import { STREAMING_ALERTS as A } from '@plot/core/copy/streamingAlerts.js';
import { BellIcon } from './PremiumAlertButtons.jsx';
import './PremiumAlertButtons.css';

/** `movie` is TMDB movie details. Render this only when the film is on the watchlist. */
export default function StreamingAlertsCard({ movie }) {
  const { user, profile } = useApp();
  const mute = useStreamingAlertMute(user?.id, movie);
  const all = useStreamingAlertsSwitch(user?.id);
  // Nothing until both reads land, so the card never flashes the wrong state.
  if (!user || !movie?.id || !movie?.title || mute.loading || all.loading) return null;

  const hasServices = (profile?.streaming_providers?.length ?? 0) > 0;
  const failed = mute.error || all.error;
  let hint = hasServices ? A.card.hint : A.card.hintNoServices;
  let action;
  if (!all.on) {
    hint = A.card.switchedOff;
    action = (
      <button type="button" className="btn btn-secondary btn-xs alert-toggle" onClick={() => all.setOn(true)}
        disabled={all.busy} aria-label={A.card.turnOnAllLabel}>
        <BellIcon on={false} />
        {A.card.turnOnAll}
      </button>
    );
  } else {
    if (mute.muted) hint = A.card.muted;
    action = (
      <button type="button" className={`btn btn-secondary btn-xs alert-toggle${mute.muted ? '' : ' alert-toggle--on'}`}
        onClick={mute.toggle} disabled={mute.busy} aria-pressed={!mute.muted}
        aria-label={mute.muted ? A.card.unmuteLabel : A.card.muteLabel}>
        <BellIcon on={!mute.muted} />
        {mute.muted ? A.card.off : A.card.on}
      </button>
    );
  }
  return (
    <section className="panel-card alert-card">
      <div className="alert-card-row">
        <div className="alert-card-copy">
          <h3 className="panel-card-title">{A.card.title}</h3>
          <p className="alert-card-hint">{hint}</p>
        </div>
        {action}
      </div>
      {failed && <p className="alert-toggle-error" role="alert">{A.error}</p>}
    </section>
  );
}
