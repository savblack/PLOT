// DOM form; the account provider owns shared persistence for web and native.
import { useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { GUIDE_REGIONS, GUIDE_COUNTRIES, guideMarketsForCountry, broadcastRegionLabel } from '@plot/core/broadcastGuide.js';
import { BROADCAST_GUIDE as COPY } from '@plot/core/copy/broadcastGuide.js';
import { COMMON } from '@plot/core/copy/common.js';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import { SettingsPreferenceRow, SettingsTextAction } from './SettingsPage.jsx';
import './BroadcastAccountSettings.css';

// One row in Settings > Viewing, like Region and Timezone beside it; Edit opens
// the market picker in a dialog rather than laying the form out inline.
export default function BroadcastAccountSettings() {
  const preferences = useApp().broadcastPreferences;
  const [editing, setEditing] = useState(false);
  if (preferences.loading) return <SettingsPreferenceRow label={COPY.region} value={COMMON.loading} disabled onEdit={() => {}} />;
  if (preferences.error) {
    return (
      <div className="settings-row settings-preference-row" role="alert">
        <div className="settings-preference-copy">
          <span className="settings-row-label">{COPY.region}</span>
          <span className="settings-selection">{COPY.preferencesError}</span>
        </div>
        <SettingsTextAction onClick={preferences.retry}>{COPY.retry}</SettingsTextAction>
      </div>
    );
  }
  return <>
    <SettingsPreferenceRow
      label={COPY.region}
      value={broadcastRegionLabel(preferences.value.market_id)}
      onEdit={() => setEditing(true)}
    />
    {editing && <RegionDialog preferences={preferences} onClose={() => setEditing(false)} />}
  </>;
}

function RegionDialog({ preferences, onClose }) {
  const [region, setRegion] = useState(preferences.value.market_id || '');
  const market = GUIDE_REGIONS.find(m => m.id === region);
  const [country, setCountry] = useState(market?.country || '');
  const [error, setError] = useState(false);
  async function save() {
    setError(false);
    const ok = await preferences.save({ market_id: region, channel_ids: region === preferences.value.market_id ? preferences.value.channel_ids : null });
    if (ok) onClose();
    else setError(true);
  }
  return (
    <ResponsiveDialog
      title={COPY.region}
      onClose={onClose}
      footer={(
        <div className="broadcast-region-footer">
          {error && <p className="broadcast-region-error" role="alert">{COPY.saveError}</p>}
          <button type="button" className="btn btn-ghost btn-sm" disabled={preferences.saving} onClick={onClose}>{COMMON.cancel}</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!region || preferences.saving} onClick={save}>
            {preferences.saving ? COMMON.saving : COPY.saveRegion}
          </button>
        </div>
      )}
    >
      <fieldset disabled={preferences.saving} className="broadcast-region-form">
        <p className="broadcast-region-hint">{COPY.accountNote}</p>
        <div className="broadcast-region-field">
          <label htmlFor="broadcast-country">{COPY.country}</label>
          <select id="broadcast-country" value={country} onChange={e => { setCountry(e.target.value); setRegion(''); }}>
            <option value="" disabled>{COPY.country}</option>
            {GUIDE_COUNTRIES.map(code => <option key={code} value={code}>{COPY.countries[code]}</option>)}
          </select>
        </div>
        <div className="broadcast-region-field">
          <label htmlFor="broadcast-market">{COPY.market}</label>
          <select id="broadcast-market" value={region} disabled={!country} onChange={e => setRegion(e.target.value)}>
            <option value="" disabled>{COPY.notConfigured}</option>
            {guideMarketsForCountry(country).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        {market && <p className="broadcast-region-hint">{COPY.coverage[market.scope]}</p>}
      </fieldset>
    </ResponsiveDialog>
  );
}
