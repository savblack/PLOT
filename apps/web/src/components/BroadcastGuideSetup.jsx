// DOM form controls; native renders the same shared setup model and copy.
import { useId } from 'react';
import { GUIDE_COUNTRIES } from '@plot/core/broadcastGuide.js';
import { useBroadcastSetup } from '@plot/core/useBroadcastSetup.js';
import { BROADCAST_GUIDE as COPY } from '@plot/core/copy/broadcastGuide.js';
import './BroadcastGuideSetup.css';

export default function BroadcastGuideSetup({ preferences, profileRegion }) {
  const setup = useBroadcastSetup(preferences, profileRegion);
  const id = useId();
  const notice = setup.market && !setup.available ? COPY.coverage[setup.market.scope] : null;
  return <div className="guide-setup-shell">
    <section className="guide-setup" aria-labelledby={`${id}-title`}>
      <div className="guide-setup-intro">
        <h2 id={`${id}-title`}>{COPY.setup.title}<br />{COPY.setup.titleEnd}</h2>
        <p>{COPY.setup.description}</p>
      </div>
      <form className="guide-setup-form" onSubmit={event => { event.preventDefault(); void setup.save(); }}>
        <fieldset disabled={preferences.saving}>
          <label className="guide-setup-row" htmlFor={`${id}-country`}>
            <span>{COPY.country}</span>
            <select id={`${id}-country`} aria-label={COPY.country} value={setup.country} onChange={event => setup.chooseCountry(event.target.value)} required>
              <option value="" disabled>{COPY.setup.countryPlaceholder}</option>
              {GUIDE_COUNTRIES.map(code => <option key={code} value={code}>{COPY.countries[code]}</option>)}
            </select>
            <Chevron />
          </label>
          <label className="guide-setup-row" htmlFor={`${id}-region`}>
            <span>{COPY.setup.area}</span>
            <select id={`${id}-region`} aria-label={COPY.setup.area} value={setup.region} disabled={!setup.country} onChange={event => setup.chooseRegion(event.target.value)} required aria-describedby={notice ? `${id}-notice` : undefined}>
              <option value="" disabled>{COPY.setup.areaPlaceholder}</option>
              {setup.markets.map(market => <option key={market.id} value={market.id}>{market.name}</option>)}
            </select>
            <Chevron />
          </label>
          {notice && <p id={`${id}-notice`} className="guide-setup-notice" role="status">{notice}</p>}
          <div className="guide-setup-actions">
            <span>{COPY.setup.hint}</span>
            <button className="btn btn-primary" type="submit" disabled={!setup.canSave}>
              {preferences.saving ? COPY.saving : COPY.setup.submit}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
            </button>
          </div>
        </fieldset>
        {setup.error && <p className="guide-setup-error" role="alert">{COPY.saveError}</p>}
      </form>
    </section>
  </div>;
}

function Chevron() {
  return <svg className="guide-setup-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
}
