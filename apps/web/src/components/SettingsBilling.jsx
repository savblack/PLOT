// Web-only Stripe portal navigation is injected by SettingsView. Checkout is
// deliberately informational: this component never invokes a billing endpoint.
import { Link, useNavigate } from 'react-router-dom';
import { SETTINGS_VIEW as T } from '../copy/settingsView.js';
import { PLANS_PAGE } from '../copy/plansPage.js';
import { SettingsTextAction } from './SettingsPage.jsx';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import { waitlistMailto } from '../utils/premiumCheckout.js';
import { membershipState, membershipDate, MEMBERSHIP_FEATURE_PATHS } from '@plot/core/membership.js';
import { SHOW_WATCH_TOGETHER } from '../launchFeatures.js';

const M = T.billing.membership;

/* What a member sees: where the membership stands, when it next changes, and
   what it gives them, each row leading to that feature. It replaces the sales
   pitch a Free viewer gets, which members used to see too. */
function MembershipCard({ state, billing, canManage, busy, error, onManage, notice }) {
  const date = membershipDate(billing);
  const line = !date ? null : state === 'trial' ? M.trialEnds(date) : state === 'ending' ? M.ends(date) : state === 'active' ? M.renews(date) : null;
  const rows = PLANS_PAGE.premiumCard.filter(row => MEMBERSHIP_FEATURE_PATHS[row.icon] && (row.icon !== 'together' || SHOW_WATCH_TOGETHER));
  return (
    <div className="settings-premium-card settings-membership">
      <div className="settings-premium-heading">
        <h3>{T.premium.groupTitle}</h3>
        <span className={`settings-status${state === 'attention' ? ' settings-status--attention' : ''}`}>{M.status[state]}</span>
      </div>
      <p>{state === 'granted' ? T.premium.accessProvidedByPlot : state === 'attention' ? T.premium.paymentNeedsAttention : T.premium.thankYou}</p>
      {line && <p className="settings-membership-date">{line}</p>}
      <h4 className="settings-membership-title">{M.includedTitle}</h4>
      <ul className="settings-membership-rows">
        {rows.map(row => (
          <li key={row.icon}>
            <Link to={MEMBERSHIP_FEATURE_PATHS[row.icon]} aria-label={M.open(row.label)}>
              <span>
                <span className="settings-membership-label">{row.label}</span>
                {row.note && <span className="settings-membership-note">{row.note}</span>}
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
      {canManage && (
        <div className="settings-billing-actions">
          <p>{T.billing.portalHint}</p>
          <SettingsTextAction disabled={busy} onClick={onManage}>
            {busy ? T.premium.opening : T.premium.manageSubscription}
          </SettingsTextAction>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert" className="settings-error">{error}</p>}
    </div>
  );
}

export default function SettingsBilling({ isPremium, canManage = false, billing, busy, error, onManage, notice, checkoutAvailable = null }) {
  const navigate = useNavigate();
  const explore = () => navigate(premiumPlansPath('/settings?section=billing'));
  const state = membershipState(billing, { isPremium, canManage });
  // Someone paying for Premium is not asked for a tip as well. Premium given
  // by Plot, and everyone on Free, still see the support note.
  const support = (
    <div className="settings-support">
      <h3>{T.billing.supportTitle}</h3>
      <p>{T.billing.supportHint}</p>
      <a className="settings-text-action" href="https://ko-fi.com/J7P123TYGK" target="_blank" rel="noopener noreferrer">
        {T.billing.supportAction}<span aria-hidden="true">→</span>
      </a>
      <p className="settings-selection">{T.billing.supportNote}</p>
    </div>
  );

  if (state) {
    return (
      <>
        <MembershipCard state={state} billing={billing} canManage={canManage} busy={busy} error={error} onManage={onManage} notice={notice} />
        {state === 'granted' && support}
      </>
    );
  }

  return (
    <>
      <div className="settings-premium-card">
        <div className="settings-premium-heading">
          <h3>{T.premium.groupTitle}</h3>
          <span className="settings-status">{T.billing.freePlan}</span>
        </div>
        <p>{canManage ? T.premium.subscriptionEnded : T.billing.intro}</p>
        {!canManage && (
          <>
            <p className="settings-selection">{PLANS_PAGE.premium.priceTerms}</p>
            <p className="settings-selection">{PLANS_PAGE.premium.trialNote}</p>
          </>
        )}
        <ul className="settings-premium-features">
          {PLANS_PAGE.planSummary.map(feature => (
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
        ) : checkoutAvailable === false ? (
          <div className="settings-billing-actions">
            <p>{PLANS_PAGE.checkoutClosedDetail}</p>
            <a className="settings-text-action" href={waitlistMailto(PLANS_PAGE.waitlistSubject)}>
              {PLANS_PAGE.waitlistAction}<span aria-hidden="true">→</span>
            </a>
          </div>
        ) : (
          <div className="settings-billing-actions">
            <p>{T.billing.exploreHint}</p>
            <SettingsTextAction onClick={explore}>{T.premium.upgradeButton}</SettingsTextAction>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert" className="settings-error">{error}</p>}
      </div>
      {support}
    </>
  );
}
