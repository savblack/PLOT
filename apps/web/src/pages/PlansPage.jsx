// Web layout uses HTML disclosure and a sticky comparison header; plan content is shared with mobile.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@plot/core/supabase.js';
import { usePremium } from '../hooks/usePremium.js';
import { useTheme } from '../hooks/useTheme.js';
// Standalone route: the .btn styles live in app.css, which only rides along on
// App.jsx's lazy chunk. Import it here so a direct /plans load gets real buttons.
import '../styles/app.css';
import './PlansPage.css';
import { PLANS_PAGE } from '../copy/plansPage.js';
import { safeAppReturnPath } from '../utils/premiumExplore.js';
import PremiumIcon from '../components/PremiumIcon.jsx';

const { comparison: CMP } = PLANS_PAGE;

// Comparison rows for features that already exist in the app link to them.
const FEATURE_LINKS = {
  fullStats: { to: '/compare', label: PLANS_PAGE.tryTasteOverlap },
};

function Tick() {
  return (
    <svg className="plan-tick" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// "plot" in a label is the brand, so it takes the wordmark's face and tracking.
function withWordmark(label) {
  const parts = label.split(/\b(plot)\b/);
  return parts.map((part, i) => (i % 2 ? <span key={i} className="plans-wordmark-inline">{part}</span> : part));
}

function FeatureRows({ items, className = '' }) {
  return (
    <ul className={`plan-rows ${className}`}>
      {items.map(item => (
        <li key={item.label}>
          <PremiumIcon name={item.icon} className="plan-icon" />
          <div>
            <span className="plan-row-label">{withWordmark(item.label)}</span>
            {item.note && <span className="plan-row-note">{item.note}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Cell({ value, premium }) {
  if (value === true) {
    return <span className={`cmp-cell cmp-yes${premium ? ' cmp-yes--premium' : ''}`} aria-label={CMP.included}><Tick /></span>;
  }
  if (value === false) return <span className="cmp-cell cmp-no" aria-label={CMP.notIncluded}>–</span>;
  return <span className="cmp-cell cmp-text">{value}</span>;
}

export default function PlansPage() {
  useTheme(); // apply the saved/system theme on this standalone route
  const [searchParams] = useSearchParams();
  const backTo = safeAppReturnPath(searchParams.get('from'), '/');
  const backLabel = backTo === '/' ? PLANS_PAGE.back : PLANS_PAGE.backToApp;
  const [profile, setProfile] = useState(null);
  const [authState, setAuthState] = useState('loading'); // loading | anon | signed-in
  // Annual by default. A monthly intent opens on monthly: sign-up and onboarding
  // send ?billing=, older website links send ?plan=.
  const [annual, setAnnual] = useState((searchParams.get('billing') ?? searchParams.get('plan')) !== 'monthly');
  const [premiumOnly, setPremiumOnly] = useState(false);
  const premium = usePremium(profile);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!alive) return;
        if (!user) { setAuthState('anon'); return; }
        const { data } = await supabase
          .from('profiles')
          .select('id, is_premium')
          .eq('id', user.id)
          .maybeSingle();
        if (!alive) return;
        setProfile(data ?? { id: user.id, is_premium: false });
        setAuthState('signed-in');
      } catch {
        // No session / auth unavailable — treat as a signed-out visitor so the
        // page still renders its call to action instead of hanging on "loading".
        if (alive) setAuthState('anon');
      }
    })();
    return () => { alive = false; };
  }, []);

  const isPremium = authState === 'signed-in' && premium.isPremium;
  // Manage subscription follows the billing relationship, as Settings does, not the entitlement.
  const canManage = authState === 'signed-in' && premium.canManage;
  const groups = CMP.groups
    .map(group => ({ ...group, rows: group.rows.filter(row => !premiumOnly || row.free !== row.premium) }))
    .filter(group => group.rows.length);

  return (
    <div className="plans-page">
      <div className="plans-shell">
        <header className="plans-head">
          <Link to={backTo} className="plans-back">{backLabel}</Link>
          <span className="plans-wordmark">plot</span>
        </header>

        <div className="plans-hero">
          <div>
            <p className="plans-eyebrow">{PLANS_PAGE.eyebrow}</p>
            <h1 className="plans-title">{PLANS_PAGE.title}</h1>
          </div>
          <div className="plans-hero-side">
            <p className="plans-lede">{PLANS_PAGE.lede}</p>
            <div className="plans-billing" role="group" aria-label={PLANS_PAGE.billing.label}>
              <button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>{PLANS_PAGE.billing.monthly}</button>
              <button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>
                {PLANS_PAGE.billing.annual} <span className="plans-billing-badge">{PLANS_PAGE.billing.annualBadge}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="plans-cards">
          <article className="plan-card">
            <div className="plan-card-top">
              <h2 className="plan-name">{PLANS_PAGE.free.name}</h2>
              <span className="plan-pill plan-pill--free">{PLANS_PAGE.free.status}</span>
            </div>
            <div>
              <div className="plan-price">
                <span className="plan-amount">{PLANS_PAGE.free.price}</span>
                <span className="plan-per">{PLANS_PAGE.free.perpetual}</span>
              </div>
              <p className="plan-billed">{PLANS_PAGE.free.noCard}</p>
            </div>
            {authState === 'signed-in' ? (
              <span className="plan-current">{isPremium ? PLANS_PAGE.free.includedWithPremium : PLANS_PAGE.free.yourCurrentPlan}</span>
            ) : <Link to="/signup" className="btn btn-secondary">{PLANS_PAGE.free.getStartedFree}</Link>}
            <p className="plan-intro">{PLANS_PAGE.freeIntro}</p>
            <FeatureRows items={PLANS_PAGE.freeCard} />
          </article>

          <article className="plan-card plan-card--premium">
            <div className="plan-card-top">
              <h2 className="plan-name">{PLANS_PAGE.premium.name}</h2>
              <span className="plan-pill plan-pill--soon">{PLANS_PAGE.comingSoon}</span>
            </div>
            <div>
              <div className="plan-price">
                {annual && <s className="plan-was" aria-hidden="true">{PLANS_PAGE.premium.price}</s>}
                <span className="plan-amount">{annual ? PLANS_PAGE.premium.annualMonthlyPrice : PLANS_PAGE.premium.price}</span>
                <span className="plan-per">{PLANS_PAGE.premium.period}</span>
              </div>
              <p className="plan-billed">{annual ? PLANS_PAGE.premium.annualBilled : PLANS_PAGE.premium.monthlyBilled}</p>
            </div>
            {canManage ? (
              <button className="btn btn-secondary" onClick={premium.openPortal} disabled={premium.busy}>
                {premium.busy ? PLANS_PAGE.premium.opening : PLANS_PAGE.premium.manageSubscription}
              </button>
            ) : isPremium ? (
              <span className="plan-current">{PLANS_PAGE.free.yourCurrentPlan}</span>
            ) : (
              <button className="btn btn-primary" onClick={() => premium.startCheckout()} disabled={authState === 'loading'}>
                {PLANS_PAGE.upgradeAction}
              </button>
            )}
            {premium.comingSoon && <p className="plans-note" role="status">{PLANS_PAGE.checkoutMessage}</p>}
            {premium.error && <p className="plans-note plans-note--err" role="alert">{premium.error}</p>}
            <p className="plan-intro">{PLANS_PAGE.premiumIntro}</p>
            <FeatureRows items={PLANS_PAGE.premiumCard} className="plan-rows--two" />
            <p className="plan-availability">{PLANS_PAGE.premium.availability}</p>
          </article>
        </div>

        <ul className="plans-assure">
          {PLANS_PAGE.assurances.map(line => <li key={line}><Tick />{line}</li>)}
        </ul>

        <section className="plans-host" aria-labelledby="host-title">
          <div className="plans-avatars" aria-hidden="true">
            <span className="plans-avatar plans-avatar--host">{PLANS_PAGE.host.you}</span>
            <span className="plans-avatar" />
            <span className="plans-avatar" />
            <span className="plans-avatar" />
          </div>
          <div>
            <h2 id="host-title">{PLANS_PAGE.host.title}</h2>
            <p>{PLANS_PAGE.host.body}</p>
          </div>
          <span className="plan-pill plan-pill--soon">{PLANS_PAGE.host.status}</span>
        </section>

        <section className="plans-compare" aria-labelledby="compare-title">
          <div className="plans-compare-head">
            <div>
              <h2 id="compare-title" className="plans-h2">{CMP.title}</h2>
              <p className="plans-compare-note">{CMP.note}</p>
            </div>
            <label className="plans-switch" htmlFor="plans-premium-only">
              <input
                type="checkbox"
                id="plans-premium-only"
                role="switch"
                checked={premiumOnly}
                onChange={e => setPremiumOnly(e.target.checked)}
              />
              {CMP.filter}
            </label>
          </div>
          <table className="cmp-table">
            <thead>
              <tr>
                <th scope="col" className="cmp-feat"><span className="plans-sr">{CMP.featureHeader}</span></th>
                <th scope="col">{CMP.freeHeader}</th>
                <th scope="col">{CMP.premiumHeader}</th>
              </tr>
            </thead>
            {groups.map(group => (
              <tbody key={group.title}>
                <tr className="cmp-group"><th scope="colgroup" colSpan={3}>{group.title}</th></tr>
                {group.rows.map(row => (
                  <tr key={row.label}>
                    <th scope="row" className="cmp-feat">
                      {row.label}
                      {row.tag && <span className="cmp-soon">{row.tag}</span>}
                      {FEATURE_LINKS[row.id] && <Link className="cmp-link" to={FEATURE_LINKS[row.id].to}>{FEATURE_LINKS[row.id].label} <span aria-hidden="true">→</span></Link>}
                    </th>
                    <td><Cell value={row.free} /></td>
                    <td><Cell value={row.premium} premium /></td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </section>

        <section className="faq-wrap" aria-labelledby="faq-title">
          <h2 id="faq-title" className="plans-h2">{PLANS_PAGE.faqTitle}</h2>
          <div className="faq-list">
            {PLANS_PAGE.faqs.map((item, i) => (
              <details className="faq-item" key={item.q} open={i === 0}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <p className="plans-fineprint">{PLANS_PAGE.fineprint}</p>

        <footer className="plans-foot">
          <Link to="/terms">{PLANS_PAGE.terms}</Link>
          <span aria-hidden="true">·</span>
          <Link to="/privacy">{PLANS_PAGE.privacy}</Link>
        </footer>
      </div>
    </div>
  );
}
