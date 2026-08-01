import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase.js';
import { usePremium } from '../hooks/usePremium.js';
import { useTheme } from '../hooks/useTheme.js';
import { FREE_CUSTOM_LIST_CAP } from '@plot/core/premium.js';
import { SHOW_MEDIA_SYNC_INTEGRATIONS } from '../launchFeatures.js';
import './PlansPage.css';
import { PLANS_PAGE } from '../copy/plansPage.js';

// Pricing (AUD). Annual is billed once a year; we surface the effective
// monthly price so the saving is obvious.
const MONTHLY_PRICE = 3;
const ANNUAL_PRICE = 25;
const ANNUAL_MONTHLY = (ANNUAL_PRICE / 12).toFixed(2); // effective $/mo when billed yearly
const ANNUAL_SAVING_PCT = Math.round((1 - ANNUAL_PRICE / (MONTHLY_PRICE * 12)) * 100);

const FREE_HIGHLIGHTS = [
  PLANS_PAGE.free.highlights[0],
  PLANS_PAGE.free.highlights[1],
  PLANS_PAGE.free.highlights[2],
  PLANS_PAGE.free.customListCap(FREE_CUSTOM_LIST_CAP),
  PLANS_PAGE.free.highlights[3],
];

const PREMIUM_HIGHLIGHTS = [
  PLANS_PAGE.premium.highlights.unlimitedLists,
  ...(SHOW_MEDIA_SYNC_INTEGRATIONS
    ? [
        PLANS_PAGE.premium.highlights.plexSync,
        PLANS_PAGE.premium.highlights.traktSync,
      ]
    : []),
  PLANS_PAGE.premium.highlights.alwaysUpToDate,
];

// Full feature matrix for the comparison table. `premium` true = the row is a
// Premium-only unlock; a string on either side renders as a label instead of a tick.
const COMPARISON = [
  { label: PLANS_PAGE.comparison.rows.track, free: true, premium: true },
  { label: PLANS_PAGE.comparison.rows.watchlist, free: true, premium: true },
  { label: PLANS_PAGE.comparison.rows.calendar, free: true, premium: true },
  { label: PLANS_PAGE.comparison.rows.discover, free: true, premium: true },
  { label: PLANS_PAGE.comparison.rows.search, free: true, premium: true },
  { label: PLANS_PAGE.comparison.rows.social, free: true, premium: true },
  { label: PLANS_PAGE.comparison.rows.reminders, free: true, premium: true },
  { label: PLANS_PAGE.comparison.rows.customLists, free: PLANS_PAGE.comparison.customListCapShort(FREE_CUSTOM_LIST_CAP), premium: PLANS_PAGE.comparison.unlimited },
  ...(SHOW_MEDIA_SYNC_INTEGRATIONS
    ? [
        { label: PLANS_PAGE.comparison.rows.plexSync, free: false, premium: true },
        { label: PLANS_PAGE.comparison.rows.traktSync, free: false, premium: true },
        { label: PLANS_PAGE.comparison.rows.autoSync, free: false, premium: true },
      ]
    : []),
];

const FAQS = [
  PLANS_PAGE.faqs.isFreeReallyFree,
  PLANS_PAGE.faqs.cancelAnytime,
  PLANS_PAGE.faqs.downgradeLists,
  ...(SHOW_MEDIA_SYNC_INTEGRATIONS ? [PLANS_PAGE.faqs.howSyncWorks] : []),
];

function Tick() {
  return (
    <svg className="plan-tick" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Cell({ value }) {
  if (value === true) return <span className="cmp-yes" aria-label={PLANS_PAGE.comparison.included}><Tick /></span>;
  if (value === false) return <span className="cmp-no" aria-label={PLANS_PAGE.comparison.notIncluded}>—</span>;
  return <span className="cmp-text">{value}</span>;
}

export default function PlansPage() {
  useTheme(); // apply the saved/system theme on this standalone route
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [authState, setAuthState] = useState('loading'); // loading | anon | signed-in
  const [billing, setBilling] = useState(() =>
    new URLSearchParams(location.search).get('billing') === 'monthly' ? 'monthly' : 'annual',
  ); // 'annual' | 'monthly' — default to the best value
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
  const annual = billing === 'annual';

  const goPremium = () => {
    if (authState === 'anon') { navigate('/signup'); return; }
    premium.startCheckout(annual ? 'yearly' : 'monthly', 'plans_page');
  };

  return (
    <div className="plans-page">
      <div className="plans-shell">
        <header className="plans-head">
          <Link to="/" className="plans-back">{PLANS_PAGE.back}</Link>
          <span className="plans-wordmark">PLOT</span>
        </header>

        <div className="plans-hero">
          <p className="plans-eyebrow">{PLANS_PAGE.eyebrow}</p>
          <h1 className="plans-title">{PLANS_PAGE.title}</h1>
          <p className="plans-lede">
            {PLANS_PAGE.lede}
          </p>

          <div className="billing-toggle" role="group" aria-label={PLANS_PAGE.billingGroupLabel}>
            <button
              type="button"
              className={`billing-opt ${!annual ? 'is-active' : ''}`}
              aria-pressed={!annual}
              onClick={() => setBilling('monthly')}
            >
              {PLANS_PAGE.monthly}
            </button>
            <button
              type="button"
              className={`billing-opt ${annual ? 'is-active' : ''}`}
              aria-pressed={annual}
              onClick={() => setBilling('annual')}
            >
              {PLANS_PAGE.annual}
              <span className="billing-save">{PLANS_PAGE.savePct(ANNUAL_SAVING_PCT)}</span>
            </button>
          </div>
        </div>

        <div className="plans-grid">
          {/* Free */}
          <section className="plan-card">
            <div className="plan-card-head">
              <h2 className="plan-name">{PLANS_PAGE.free.name}</h2>
              <div className="plan-price">
                <span className="plan-amount">$0</span>
                <span className="plan-per">{PLANS_PAGE.free.perpetual}</span>
              </div>
              <p className="plan-tagline">{PLANS_PAGE.free.tagline}</p>
            </div>
            <ul className="plan-features">
              {FREE_HIGHLIGHTS.map(f => <li key={f}><Tick />{f}</li>)}
            </ul>
            <div className="plan-cta">
              {authState === 'signed-in' ? (
                <button className="btn btn-secondary" disabled>
                  {isPremium ? PLANS_PAGE.free.includedWithPremium : PLANS_PAGE.free.yourCurrentPlan}
                </button>
              ) : (
                <Link to="/signup" className="btn btn-secondary">{PLANS_PAGE.free.getStartedFree}</Link>
              )}
            </div>
          </section>

          {/* Premium */}
          <section className="plan-card plan-card--premium">
            <span className="plan-flag">{PLANS_PAGE.premium.recommended}</span>
            <div className="plan-card-head">
              <h2 className="plan-name">{PLANS_PAGE.premium.name}</h2>
              <div className="plan-price">
                <span className="plan-amount">A${annual ? ANNUAL_MONTHLY : MONTHLY_PRICE}</span>
                <span className="plan-per">{PLANS_PAGE.premium.perMonth}</span>
              </div>
              <p className="plan-billed">
                {annual
                  ? PLANS_PAGE.premium.billedYearly(ANNUAL_PRICE, ANNUAL_SAVING_PCT)
                  : PLANS_PAGE.premium.billedMonthly}
              </p>
              <p className="plan-tagline">{PLANS_PAGE.premium.everythingInFreePlus}</p>
            </div>
            <ul className="plan-features">
              {PREMIUM_HIGHLIGHTS.map(f => <li key={f}><Tick />{f}</li>)}
            </ul>
            <div className="plan-cta">
              {authState === 'loading' ? (
                <button className="btn btn-primary" disabled>…</button>
              ) : isPremium ? (
                <button className="btn btn-secondary" onClick={premium.openPortal} disabled={premium.busy}>
                  {premium.busy ? PLANS_PAGE.premium.opening : PLANS_PAGE.premium.manageSubscription}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={goPremium} disabled={premium.busy}>
                  {premium.busy ? '…' : PLANS_PAGE.premium.goPremium}
                </button>
              )}
            </div>
          </section>
        </div>

        {isPremium && (
          <p className="plans-note plans-note--ok">{PLANS_PAGE.onPremiumNote}</p>
        )}
        {premium.error && (
          <p className="plans-note plans-note--err">{premium.error}</p>
        )}

        {/* Full comparison */}
        <div className="cmp-wrap">
          <h2 className="cmp-title">{PLANS_PAGE.comparison.title}</h2>
          <div className="cmp-scroll">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th scope="col" className="cmp-feat">{PLANS_PAGE.comparison.featureHeader}</th>
                  <th scope="col">{PLANS_PAGE.comparison.freeHeader}</th>
                  <th scope="col" className="cmp-prem">{PLANS_PAGE.comparison.premiumHeader}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(row => (
                  <tr key={row.label}>
                    <th scope="row" className="cmp-feat">{row.label}</th>
                    <td><Cell value={row.free} /></td>
                    <td className="cmp-prem"><Cell value={row.premium} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="faq-wrap">
          <h2 className="faq-title">{PLANS_PAGE.faqTitle}</h2>
          <dl className="faq-list">
            {FAQS.map(item => (
              <div className="faq-item" key={item.q}>
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="plans-fineprint">
          {PLANS_PAGE.finePrint}
          {' '}{PLANS_PAGE.finePrintCancel}
          {' '}{PLANS_PAGE.finePrintContact} <a href="mailto:contact@theplot.tv">contact@theplot.tv</a>
        </p>

        <footer className="plans-foot">
          <Link to="/terms">{PLANS_PAGE.terms}</Link>
          <span aria-hidden="true">·</span>
          <Link to="/privacy">{PLANS_PAGE.privacy}</Link>
        </footer>
      </div>
    </div>
  );
}
