// DOM form; the account provider owns shared persistence for web and native.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { GUIDE_REGIONS, GUIDE_COUNTRIES, guideMarketsForCountry } from '@plot/core/broadcastGuide.js';
import { BROADCAST_GUIDE as COPY } from '@plot/core/copy/broadcastGuide.js';
import './BroadcastGuidePreview.css';

export default function BroadcastAccountSettings() {
  const preferences = useApp().broadcastPreferences;
  if (preferences.loading) return <p role="status">{COPY.loading}</p>;
  if (preferences.error) return <div role="alert"><p>{COPY.preferencesError}</p><button onClick={preferences.retry}>{COPY.retry}</button></div>;
  return <RegionForm preferences={preferences} />;
}

function RegionForm({ preferences }) {
  const [region, setRegion] = useState(preferences.value.market_id || '');
  const market = GUIDE_REGIONS.find(m => m.id === region);
  const [country, setCountry] = useState(market?.country || '');
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  async function save() {
    setError(false);
    const ok = await preferences.save({ market_id: region, channel_ids: region === preferences.value.market_id ? preferences.value.channel_ids : null });
    setError(!ok);
    setSaved(ok);
  }
  return <section className="broadcast-guide broadcast-region-settings" aria-label={COPY.region}>
    <h3>{COPY.region}</h3><p className="broadcast-note">{COPY.accountNote}</p>
    <fieldset disabled={preferences.saving} className="broadcast-picker">
      <label htmlFor="broadcast-country">{COPY.country}</label>
      <select id="broadcast-country" value={country} onChange={e => { setCountry(e.target.value); setRegion(''); setSaved(false); }}>
        <option value="" disabled>{COPY.country}</option>
        {GUIDE_COUNTRIES.map(code => <option key={code} value={code}>{COPY.countries[code]}</option>)}
      </select>
      <label htmlFor="broadcast-market">{COPY.market}</label>
      <select id="broadcast-market" value={region} disabled={!country} onChange={e => { setRegion(e.target.value); setSaved(false); }}>
        <option value="" disabled>{COPY.notConfigured}</option>
        {guideMarketsForCountry(country).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      {market && <p className="broadcast-note">{COPY.coverage[market.scope]}</p>}
      <div className="broadcast-actions"><button disabled={!region} onClick={save}>{preferences.saving ? COPY.saving : COPY.saveRegion}</button><Link to="/guide">{COPY.backToGuide}</Link></div>
    </fieldset>
    {saved && <p role="status">{COPY.regionSaved}</p>}
    {error && <p role="alert">{COPY.saveError}</p>}
  </section>;
}
