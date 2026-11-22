// Settings > Viewing: the two Episode alerts switches for every show. Each show
// also has its own switch on its title panel (EpisodeAlertsCard). Free for
// everyone. Logic: @plot/core/useEpisodeAlertSettings.js.
//
// The phone switch only matters in the iPhone app, but a web visitor may use
// both, so it is shown here too.
//
// Mobile: EpisodeAlertsSettings in apps/mobile/app/(app)/settings.tsx (same hook and copy).
import { useEpisodeAlertSettings } from '@plot/core/useEpisodeAlertSettings.js';
import { EPISODE_ALERTS } from '@plot/core/copy/episodeAlerts.js';
import { track, EVENTS } from '../lib/analytics.js';
import { SettingsSwitch } from './SettingsPage.jsx';

const S = EPISODE_ALERTS.settings;
const muted = { fontSize: '0.75rem', color: 'var(--text-muted)' };

export default function EpisodeAlertsSettings({ userId }) {
  const alerts = useEpisodeAlertSettings(userId);
  if (!userId || alerts.loading) return null;
  const change = async (setting, on) => {
    const ok = await (setting === 'in_app' ? alerts.setInApp(on) : alerts.setPhone(on));
    if (ok) track(EVENTS.EPISODE_ALERT_SETTING_CHANGED, { setting, on });
    else track(EVENTS.ACTION_FAILED, { action: 'episode_alert_setting' });
  };
  // A push follows the in-app notification, so with that off there is nothing to push.
  const phoneBlocked = !alerts.inApp;
  const row = (label, hint, checked, disabled, onChange) => (
    <div className="settings-row" style={{ cursor: 'default' }}>
      <div className="settings-row-left">
        <div>
          <div className="settings-row-label">{label}</div>
          <div style={muted}>{hint}</div>
        </div>
      </div>
      <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
        <SettingsSwitch label={label} checked={checked} disabled={disabled} onChange={onChange} saves />
      </div>
    </div>
  );
  return (
    <div className="settings-group">
      <div className="settings-group-title">{EPISODE_ALERTS.title}</div>
      {row(S.inAppLabel, S.inAppHint, alerts.inApp, alerts.busy || alerts.unread, () => change('in_app', !alerts.inApp))}
      {row(S.phoneLabel, phoneBlocked ? S.phoneNeedsInApp : S.phoneHint, alerts.phone && !phoneBlocked, alerts.busy || alerts.unread || phoneBlocked, () => change('phone', !alerts.phone))}
      {alerts.error && <div className="settings-row" style={{ cursor: 'default' }}><div className="settings-row-left"><div style={muted} role="alert">{EPISODE_ALERTS.error}</div></div></div>}
    </div>
  );
}
