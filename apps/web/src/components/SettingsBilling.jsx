// Web-only Stripe portal navigation is injected by SettingsView. Checkout is
// deliberately informational: this component never invokes a billing endpoint.
import { useNavigate } from 'react-router-dom';
import { SETTINGS_VIEW as T } from '../copy/settingsView.js';
import { PLANS_PAGE } from '../copy/plansPage.js';
import { SettingsTextAction } from './SettingsPage.jsx';
import { premiumPlansPath } from '../utils/premiumExplore.js';

export default function SettingsBilling({ isPremium, canManage = false, billing, busy, error, onManage, notice }) {
  const navigate = useNavigate();
  const explore = () => navigate(premiumPlansPath('/settings?section=billing'));

  return (
    <>
      <div className="settings-premium-card">
        <div className="settings-premium-heading">
          <h3>{T.premium.groupTitle}</h3>
          <span className="settings-status">{isPremium ? T.billing.active : T.billing.freePlan}</span>
        </div>
        <p>{canManage && !isPremium ? T.premium.subscriptionEnded : isPremium ? T.premium.thankYou : T.billing.intro}</p>
        {!isPremium && !canManage && (
          <p className="settings-selection">
            {PLANS_PAGE.premium.priceSummary}
            <span aria-hidden="true"> · </span>
            {PLANS_PAGE.comingSoon}
          </p>
        )}
        <ul className="settings-premium-features">
          {(isPremium ? T.billing.features : PLANS_PAGE.planSummary).map(feature => (
            <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>
          ))}
        </ul>
        {canManage ? (
          <div className="settings-billing-actions">
            <p>{billing?.status === 'past_due' || billing?.status === 'unpaid' ? T.premium.paymentNeedsAttention : billing?.cancelAtPeriodEnd ? T.premium.cancellationScheduled : T.billing.portalHint}</p>
            <SettingsTextAction disabled={busy} onClick={onManage}>
              {busy ? T.premium.opening : T.premium.manageSubscription}
            </SettingsTextAction>
          </div>
        ) : !isPremium && (
          <div className="settings-billing-actions">
            <p>{T.billing.exploreHint}</p>
            <SettingsTextAction onClick={explore}>{T.premium.upgradeButton}</SettingsTextAction>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert" className="settings-error">{error}</p>}
      </div>
      <div className="settings-support">
        <h3>{T.billing.supportTitle}</h3>
        <p>{T.billing.supportHint}</p>
        <a className="settings-text-action" href="https://ko-fi.com/J7P123TYGK" target="_blank" rel="noopener noreferrer">
          {T.billing.supportAction}<span aria-hidden="true">→</span>
        </a>
        <p className="settings-selection">{T.billing.supportNote}</p>
      </div>
    </>
  );
}
