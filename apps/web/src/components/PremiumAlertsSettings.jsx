// Settings > Viewing: one line for the people someone follows ("People you
// follow · Manage", which opens the Your people page, the one place to manage
// them), and the shows and films they have alerts for, with Remove.
// Removing works on any plan, so a lapsed subscription can still tidy up.
// Logic: @plot/core/usePeopleFollows.js and @plot/core/usePremiumAlerts.js.
//
// Mobile parity: not shipped on mobile yet (issue 1093).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMyAlerts } from '@plot/core/usePremiumAlerts.js';
import { usePeopleFollows } from '@plot/core/usePeopleFollows.js';
import { PREMIUM_ALERTS } from '@plot/core/copy/premiumAlerts.js';
import { PEOPLE } from '@plot/core/copy/people.js';
import { SettingsTextAction } from './SettingsPage.jsx';

const S = PREMIUM_ALERTS.settings;
const muted = { fontSize: '0.75rem', color: 'var(--text-muted)' };

export default function PremiumAlertsSettings({ userId, isPremium }) {
  const navigate = useNavigate();
  const { shows, films, loading, removeShow, removeFilm } = useMyAlerts(userId);
  const people = usePeopleFollows(userId);
  const [busy, setBusy] = useState(false);
  if (loading || people.loading) return null;
  const showPeople = isPremium || people.follows.length > 0;
  if (!showPeople && !shows.length && !films.length) return null;
  const remover = (fn) => async (id) => { setBusy(true); await fn(id); setBusy(false); };
  const remove = remover(removeShow);
  const removeFilmAlert = remover(removeFilm);
  return <>
    {showPeople && <div className="settings-group">
      <div className="settings-row" style={{ cursor: 'default' }}>
        <div className="settings-row-left">
          <div>
            <div className="settings-row-label">{PEOPLE.settings.label}</div>
            <div style={muted}>{PEOPLE.settings.count(people.follows.length)}</div>
          </div>
        </div>
        <SettingsTextAction onClick={() => navigate('/your-people')}>{PEOPLE.settings.manage}</SettingsTextAction>
      </div>
    </div>}
    {shows.length > 0 && <div className="settings-group">
      <div className="settings-group-title">{S.shows}</div>
      {!isPremium && <div className="settings-row" style={{ cursor: 'default' }}><div className="settings-row-left"><div style={muted}>{S.lapsed}</div></div></div>}
      {shows.map(s => (
        <div key={s.tmdb_id} className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left"><div className="settings-row-label">{s.title}</div></div>
          <SettingsTextAction onClick={() => remove(s.tmdb_id)} disabled={busy} label={S.removeLabel(s.title)}>{S.remove}</SettingsTextAction>
        </div>
      ))}
    </div>}
    {films.length > 0 && <div className="settings-group">
      <div className="settings-group-title">{S.films}</div>
      {!isPremium && <div className="settings-row" style={{ cursor: 'default' }}><div className="settings-row-left"><div style={muted}>{S.lapsed}</div></div></div>}
      {films.map(f => (
        <div key={f.tmdb_id} className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left"><div className="settings-row-label">{f.title}</div></div>
          <SettingsTextAction onClick={() => removeFilmAlert(f.tmdb_id)} disabled={busy} label={S.removeLabel(f.title)}>{S.remove}</SettingsTextAction>
        </div>
      ))}
    </div>}
  </>;
}
