// Web layout uses HTML disclosure and anchor navigation; plan content is shared with mobile.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@plot/core/supabase.js';
import { usePremium } from '../hooks/usePremium.js';
import { useTheme } from '../hooks/useTheme.js';
import { FREE_CUSTOM_LIST_CAP } from '@plot/core/premium.js';
import './PlansPage.css';
import { PLANS_PAGE } from '../copy/plansPage.js';
import { safeAppReturnPath } from '../utils/premiumExplore.js';

const COMPARISON = [
  ...PLANS_PAGE.freeFeatures.map(feature => ({
    label: feature.label,
    description: feature.description,
    free: feature.planned ? PLANS_PAGE.plannedFree : true,
    premium: feature.planned ? PLANS_PAGE.plannedFree : true,
  })),
  ...PLANS_PAGE.premiumFeatures.map(feature => ({
    label: feature.label,
    description: feature.description,
    free: false,
    premium: feature.pendingValidation ? PLANS_PAGE.pendingValidation : PLANS_PAGE.comingSoon,
  })),
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
  if (value === false) return <span className="cmp-no" aria-label={PLANS_PAGE.comparison.notIncluded}>–</span>;
  return <span className="cmp-text">{value}</span>;
}

export default function PlansPage() {
  useTheme(); // apply the saved/system theme on this standalone route
  const [searchParams] = useSearchParams();
  const backTo = safeAppReturnPath(searchParams.get('from'), '/');
  const backLabel = backTo === '/' ? PLANS_PAGE.back : PLANS_PAGE.backToApp;
  const [profile, setProfile] = useState(null);
  const [authState, setAuthState] = useState('loading'); // loading | anon | signed-in
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

  return (
    <div className="plans-page">
      <div className="plans-shell">
        <header className="plans-head">
          <Link to={backTo} className="plans-back">{backLabel}</Link>
          <span className="plans-wordmark">plot</span>
        </header>

        <div className="plans-opening">
          <div className="plans-hero">
            <p className="plans-eyebrow">{PLANS_PAGE.eyebrow}</p>
            <h1 className="plans-title">{PLANS_PAGE.title}</h1>
            <p className="plans-lede">{PLANS_PAGE.lede}</p>
            <a className="plans-text-link" href="#premium-features">{PLANS_PAGE.compareAction} <span aria-hidden="true">↓</span></a>
          </div>
          <aside className="plans-offer" aria-label={PLANS_PAGE.premium.name}>
            <span className="plan-status">{PLANS_PAGE.comingSoon}</span>
            <h2>{PLANS_PAGE.premium.tagline}</h2>
            <div className="plan-price">
              <span className="plan-amount">{PLANS_PAGE.premium.price}</span>
              <span className="plan-per">{PLANS_PAGE.premium.period}</span>
            </div>
            <p className="plan-billed">{PLANS_PAGE.premium.annual}</p>
            <ul className="plan-features">
              {PLANS_PAGE.planSummary.map(label => <li key={label}><Tick />{label}</li>)}
            </ul>
            {isPremium ? (
              <button className="btn btn-secondary" onClick={premium.openPortal} disabled={premium.busy}>
                {premium.busy ? PLANS_PAGE.premium.opening : PLANS_PAGE.premium.manageSubscription}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => premium.startCheckout()} disabled={authState === 'loading'}>
                {PLANS_PAGE.upgradeAction}
              </button>
            )}
            <p className="plan-availability">{PLANS_PAGE.premium.availability}</p>
            {premium.comingSoon && <p className="plans-note" role="status">{PLANS_PAGE.checkoutMessage}</p>}
            {premium.error && <p className="plans-note plans-note--err" role="alert">{premium.error}</p>}
          </aside>
        </div>

        <section className="plans-stories" id="premium-features" aria-labelledby="stories-title">
          <div className="plans-section-head">
            <h2 id="stories-title">{PLANS_PAGE.storyIntro}</h2>
            <span className="plan-status">{PLANS_PAGE.previewLabel}</span>
          </div>
          {PLANS_PAGE.stories.map((story, index) => (
            <article className="plans-story" key={story.id}>
              <div className="plans-story-copy">
                <p className="plans-kicker"><span aria-hidden="true">0{index + 1}</span> {story.kicker}</p>
                <h3>{story.title}</h3>
                <p>{story.description}</p>
                <p className="plans-story-detail">{story.detail}</p>
              </div>
              <figure className="plans-example">
                <ol>{story.example.map((line, i) => <li key={line}><span aria-hidden="true">0{i + 1}</span>{line}</li>)}</ol>
                <figcaption>{story.caption}</figcaption>
              </figure>
            </article>
          ))}
        </section>

        <section className="plans-free" aria-labelledby="free-title">
          <div>
            <p className="plans-eyebrow">{PLANS_PAGE.free.name} · $0</p>
            <h2 id="free-title">{PLANS_PAGE.freeTitle}</h2>
            <p>{PLANS_PAGE.freeDescription}</p>
            <ul>{PLANS_PAGE.freeGroups.map(label => <li key={label}><Tick />{label}</li>)}</ul>
          </div>
          <div className="plans-free-next">
            <p>{PLANS_PAGE.freePlanned}</p>
            <p className="plans-free-limit">{PLANS_PAGE.customLists(FREE_CUSTOM_LIST_CAP)}</p>
            {authState === 'signed-in' ? (
              <span className="plan-status">{isPremium ? PLANS_PAGE.free.includedWithPremium : PLANS_PAGE.free.yourCurrentPlan}</span>
            ) : <Link to="/signup" className="btn btn-secondary">{PLANS_PAGE.free.getStartedFree}</Link>}
          </div>
        </section>

        {/* Full comparison */}
        <details className="cmp-wrap">
          <summary>{PLANS_PAGE.comparison.title}</summary>
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
                    <th scope="row" className="cmp-feat">
                      {row.label}
                      {row.description && <p className="plan-feature-description">{row.description}</p>}
                    </th>
                    <td><Cell value={row.free} /></td>
                    <td className="cmp-prem"><Cell value={row.premium} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        {/* FAQ */}
        <div className="faq-wrap">
          <h2 className="faq-title">{PLANS_PAGE.faqTitle}</h2>
          <dl className="faq-list">
            {PLANS_PAGE.faqs.map(item => (
              <div className="faq-item" key={item.q}>
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>

        <footer className="plans-foot">
          <Link to="/terms">{PLANS_PAGE.terms}</Link>
          <span aria-hidden="true">·</span>
          <Link to="/privacy">{PLANS_PAGE.privacy}</Link>
        </footer>
      </div>
    </div>
  );
}
