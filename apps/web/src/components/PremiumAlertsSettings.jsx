// Settings > Viewing: the people and shows someone gets Premium alerts for,
// with a way to remove each. Removing works on any plan, so a lapsed
// subscription can still tidy its list. Opt-ins are added from a person's page
// and a show's panel (PremiumAlertButtons.jsx). Logic: @plot/core/usePremiumAlerts.js.
//
// Mobile parity: not shipped on mobile yet (see PremiumAlertButtons.jsx).
import { useState } from 'react';
import { useMyAlerts } from '@plot/core/usePremiumAlerts.js';
import { PREMIUM_ALERTS } from '@plot/core/copy/premiumAlerts.js';
import { SettingsTextAction } from './SettingsPage.jsx';

const S = PREMIUM_ALERTS.settings;
const muted = { fontSize: '0.75rem', color: 'var(--text-muted)' };

export default function PremiumAlertsSettings({ userId, isPremium }) {
  const { people, shows, loading, removePerson, removeShow } = useMyAlerts(userId);
  const [busy, setBusy] = useState(false);
  // Free accounts with nothing opted in don't need an empty Premium section.
  if (loading || (!isPremium && !people.length && !shows.length)) return null;
  const remove = async (fn, id) => { setBusy(true); await fn(id); setBusy(false); };
  const row = (key, label, onRemove) => (
    <div key={key} className="settings-row" style={{ cursor: 'default' }}>
      <div className="settings-row-left"><div className="settings-row-label">{label}</div></div>
      <SettingsTextAction onClick={onRemove} disabled={busy} label={S.removeLabel(label)}>{S.remove}</SettingsTextAction>
    </div>
  );
  const empty = (text) => (
    <div className="settings-row" style={{ cursor: 'default' }}>
      <div className="settings-row-left"><div style={muted}>{text}</div></div>
    </div>
  );
  return <>
    <div className="settings-group">
      <div className="settings-group-title">{S.people}</div>
      {!isPremium && empty(S.lapsed)}
      {people.length ? people.map(p => row(`p${p.tmdb_person_id}`, p.name, () => remove(removePerson, p.tmdb_person_id))) : empty(S.nonePeople)}
    </div>
    <div className="settings-group">
      <div className="settings-group-title">{S.shows}</div>
      {shows.length ? shows.map(s => row(`s${s.tmdb_id}`, s.title, () => remove(removeShow, s.tmdb_id))) : empty(S.noneShows)}
    </div>
  </>;
}
