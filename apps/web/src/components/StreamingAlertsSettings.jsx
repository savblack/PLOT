// Settings > Viewing: where to manage streaming alerts. One switch for the
// whole thing and the films someone has muted, each with a way to turn it back
// on. Free for everyone: the alerts are automatic for films on the watchlist,
// so there is nothing to opt in to, only this to opt out of.
// Logic: @plot/core/useStreamingAlerts.js.
//
// Premium adds an "Also email me" row under the switch (hidden until
// ALERT_EMAIL_ENABLED, features.js). Free sees it too and gets the upgrade
// sheet; turning it off always works.
//
// Mobile: StreamingAlertsSettings in apps/mobile/app/(app)/settings.tsx (same hooks and copy).
import { useState } from 'react';
import { useStreamingAlertsSwitch, useMutedFilms, useStreamingEmailSwitch } from '@plot/core/useStreamingAlerts.js';
import { STREAMING_ALERTS } from '@plot/core/copy/streamingAlerts.js';
import { ALERT_EMAIL } from '@plot/core/copy/alertEmail.js';
import { ALERT_EMAIL_ENABLED } from '@plot/core/features.js';
import { SettingsSwitch, SettingsTextAction } from './SettingsPage.jsx';
import UpgradeSheet from './UpgradeSheet.jsx';

const S = STREAMING_ALERTS.settings;
const E = ALERT_EMAIL.settings;
const muted = { fontSize: '0.75rem', color: 'var(--text-muted)' };

export default function StreamingAlertsSettings({ userId, isPremium = false }) {
  const all = useStreamingAlertsSwitch(userId);
  const { films, loading, unmute } = useMutedFilms(userId);
  // Not read at all until the email option is switched on.
  const email = useStreamingEmailSwitch(ALERT_EMAIL_ENABLED ? userId : null);
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  if (!userId || all.loading || loading || (ALERT_EMAIL_ENABLED && email.loading)) return null;
  const turnOn = async (id) => { setBusy(true); await unmute(id); setBusy(false); };
  const toggleEmail = async () => {
    // Turning it off always works. Turning it on needs Premium: a Free account
    // goes straight to the upgrade sheet, and the database is the authority if
    // the plan turns out to have changed.
    if (!email.on && !isPremium) { setSheetOpen(true); return; }
    const { error } = await email.setOn(!email.on);
    if (error === 'premium_required') setSheetOpen(true);
  };
  // Email follows the in-app alerts: with those off there is nothing to email.
  const emailBlocked = !all.on && !email.on;
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
      {ALERT_EMAIL_ENABLED && (
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div>
              <div className="settings-row-label">{E.label}</div>
              <div style={muted}>{emailBlocked ? E.needsAlerts : E.hint}</div>
            </div>
          </div>
          <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
            <SettingsSwitch label={E.label} checked={email.on} disabled={email.busy || emailBlocked} onChange={toggleEmail} />
          </div>
        </div>
      )}
      {ALERT_EMAIL_ENABLED && email.error && <div className="settings-row" style={{ cursor: 'default' }}><div className="settings-row-left"><div style={muted} role="alert">{E.error}</div></div></div>}
      {sheetOpen && <UpgradeSheet reason="alertEmail" onClose={() => setSheetOpen(false)} />}
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
