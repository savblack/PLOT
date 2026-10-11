// Settings > Viewing: where to manage streaming alerts. One switch for the
// whole thing and the films someone has muted, each with a way to turn it back
// on. Free for everyone: the alerts are automatic for films on the watchlist,
// so there is nothing to opt in to, only this to opt out of.
// Logic: @plot/core/useStreamingAlerts.js.
//
// Mobile: StreamingAlertsSettings in apps/mobile/app/(app)/settings.tsx (same hooks and copy).
import { useState } from 'react';
import { useStreamingAlertsSwitch, useMutedFilms } from '@plot/core/useStreamingAlerts.js';
import { STREAMING_ALERTS } from '@plot/core/copy/streamingAlerts.js';
import { SettingsSwitch, SettingsTextAction } from './SettingsPage.jsx';

const S = STREAMING_ALERTS.settings;
const muted = { fontSize: '0.75rem', color: 'var(--text-muted)' };

export default function StreamingAlertsSettings({ userId }) {
  const all = useStreamingAlertsSwitch(userId);
  const { films, loading, unmute } = useMutedFilms(userId);
  const [busy, setBusy] = useState(false);
  if (!userId || all.loading || loading) return null;
  const turnOn = async (id) => { setBusy(true); await unmute(id); setBusy(false); };
  return <>
    <div className="settings-group">
      <div className="settings-group-title">{S.groupTitle}</div>
      <div className="settings-row" style={{ cursor: 'default' }}>
        <div className="settings-row-left">
          <div>
            <div className="settings-row-label">{S.switchLabel}</div>
            <div style={muted}>{S.switchHint}</div>
          </div>
        </div>
        <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
          <SettingsSwitch label={S.switchLabel} checked={all.on} disabled={all.busy} onChange={() => all.setOn(!all.on)} />
        </div>
      </div>
      {all.error && <div className="settings-row" style={{ cursor: 'default' }}><div className="settings-row-left"><div style={muted} role="alert">{STREAMING_ALERTS.error}</div></div></div>}
    </div>
    {films.length > 0 && <div className="settings-group">
      <div className="settings-group-title">{S.muted}</div>
      {films.map(f => (
        <div key={f.tmdb_id} className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left"><div className="settings-row-label">{f.title}</div></div>
          <SettingsTextAction onClick={() => turnOn(f.tmdb_id)} disabled={busy} label={S.unmuteLabel(f.title)}>{S.unmute}</SettingsTextAction>
        </div>
      ))}
    </div>}
  </>;
}
