// Web-only Stripe portal navigation is injected by SettingsView. Checkout is
// deliberately informational: this component never invokes a billing endpoint.
import { useState } from 'react';
import { SETTINGS_VIEW as T } from '../copy/settingsView.js';
import { COMMON } from '../copy/common.js';
import ConfirmModal from './ConfirmModal.jsx';

export default function SettingsBilling({ isPremium, busy, error, onManage, notice }) {
  const [cycle, setCycle] = useState('monthly');
  const [comingSoon, setComingSoon] = useState(false);
  return (
    <>
      <div className="settings-premium-card">
        <div className="settings-premium-heading"><h3>{T.premium.groupTitle}</h3><span className="settings-status">{isPremium ? T.billing.active : T.billing.freePlan}</span></div>
        <p>{isPremium ? T.premium.thankYou : T.billing.intro}</p>
        <ul className="settings-premium-features">{T.billing.features.map(feature => <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>)}</ul>
        {isPremium ? (
          <div className="settings-billing-actions">
            <p>{T.billing.portalHint}</p>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onManage}>{busy ? T.premium.opening : T.premium.manageSubscription}</button>
          </div>
        ) : (
          <>
            <fieldset className="settings-billing-cycle">
              <legend>{T.billing.cycle}</legend>
              {['monthly', 'yearly'].map(value => <button key={value} type="button" aria-pressed={cycle === value} onClick={() => setCycle(value)}>{T.billing[value]}</button>)}
            </fieldset>
            <div className="settings-billing-actions"><p>{T.billing.comingSoon}</p><button type="button" className="btn btn-primary" onClick={() => setComingSoon(true)}>{T.billing.checkout}</button></div>
          </>
        )}
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert" className="settings-error">{error}</p>}
      </div>
      <div className="settings-support">
        <h3>{T.billing.supportTitle}</h3><p>{T.billing.supportHint}</p>
        <a className="btn btn-secondary" href="https://ko-fi.com/J7P123TYGK" target="_blank" rel="noopener noreferrer">{T.billing.supportAction}<span aria-hidden="true">↗</span></a>
        <p className="settings-selection">{T.billing.supportNote}</p>
      </div>
      {comingSoon && <ConfirmModal informational title={T.billing.comingSoon} message={T.billing.comingSoonMessage} confirmLabel={COMMON.done} onClose={() => setComingSoon(false)} />}
    </>
  );
}
