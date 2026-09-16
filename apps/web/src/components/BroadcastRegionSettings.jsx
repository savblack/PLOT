// Web-only device storage for the development preview. Account persistence will
// replace this adapter for web and mobile together before the Guide rollout.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GUIDE_REGIONS, GUIDE_COUNTRIES, guideMarketsForCountry } from '@plot/core/broadcastGuide.js';
import { BROADCAST_GUIDE as COPY } from '@plot/core/copy/broadcastGuide.js';
import './BroadcastGuidePreview.css';
import { readBroadcastRegion } from '../utils/broadcastPreviewStorage.js';

export function BroadcastRegionSetting() {
  const [region, setRegion] = useState(readBroadcastRegion);
  const market = GUIDE_REGIONS.find(item => item.id === region);
  const country = market.country;
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  function save() {
    try {
      localStorage.setItem('plot-guide-preview-region', region);
      setSaved(true);
      setError(false);
    } catch { setError(true); }
  }
  return <section className="broadcast-region-settings" id="broadcast-region-settings">
    <label htmlFor="broadcast-country">{COPY.country}</label>
    <select id="broadcast-country" value={country} onChange={event => { setRegion(guideMarketsForCountry(event.target.value)[0].id); setSaved(false); setError(false); }}>
      {GUIDE_COUNTRIES.map(code => <option key={code} value={code}>{COPY.countries[code]}</option>)}
    </select>
    <label htmlFor="broadcast-region">{COPY.market}</label>
    <select id="broadcast-region" value={region} onChange={event => { setRegion(event.target.value); setSaved(false); }}>
      {guideMarketsForCountry(country).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    <p className="broadcast-note">{COPY.coverage[market.scope]}</p>
    <button className="broadcast-primary" onClick={save}>{COPY.saveRegion}</button>
    {saved && <p role="status">{COPY.regionSaved}</p>}
    {error && <p role="alert">{COPY.storageError}</p>}
  </section>;
}

export default function BroadcastRegionSettingsPreview() {
  return <main className="broadcast-guide">
    <header className="broadcast-heading"><p>{COPY.preview}</p><h1>{COPY.settings}</h1></header>
    <BroadcastRegionSetting />
    <p className="broadcast-note">{COPY.previewNote}</p>
    <Link to="/guide-preview">{COPY.backToGuide}</Link>
  </main>;
}
