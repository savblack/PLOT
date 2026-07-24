import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase.js';
import { usePremium } from '../hooks/usePremium.js';
import { useTheme } from '../hooks/useTheme.js';
import { FREE_CUSTOM_LIST_CAP } from '@plot/core/premium.js';
import { SHOW_MEDIA_SYNC_INTEGRATIONS } from '../launchFeatures.js';
import './PlansPage.css';

// Pricing (AUD). Annual is billed once a year; we surface the effective
// monthly price so the saving is obvious.
const MONTHLY_PRICE = 3;
const ANNUAL_PRICE = 25;
const ANNUAL_MONTHLY = (ANNUAL_PRICE / 12).toFixed(2); // effective $/mo when billed yearly
const ANNUAL_SAVING_PCT = Math.round((1 - ANNUAL_PRICE / (MONTHLY_PRICE * 12)) * 100);

const FREE_HIGHLIGHTS = [
  'Track movies & TV in one place',
  'Watchlist, history & release calendar',
  'Discover feed + Top 10 charts',
  `Up to ${FREE_CUSTOM_LIST_CAP} custom lists`,
  'Follow friends & share your profile',
];

const PREMIUM_HIGHLIGHTS = [
  'Unlimited custom lists',
  ...(SHOW_MEDIA_SYNC_INTEGRATIONS
    ? [
        'Auto-sync your watchlist & history from Plex',
        'Sync Netflix, Prime, Disney+ & more via Trakt',
      ]
    : []),
  'Everything stays up to date, automatically',
];

// Full feature matrix for the comparison table. `premium` true = the row is a
// Premium-only unlock; a string on either side renders as a label instead of a tick.
const COMPARISON = [
  { label: 'Track movies & TV', free: true, premium: true },
  { label: 'Watchlist & watch history', free: true, premium: true },
  { label: 'Upcoming release calendar', free: true, premium: true },
  { label: 'Discover feed + Top 10 charts', free: true, premium: true },
  { label: 'Search every movie & show', free: true, premium: true },
  { label: 'Follow friends & share profile', free: true, premium: true },
  { label: 'Reminders & where-to-watch', free: true, premium: true },
  { label: 'Custom lists', free: `Up to ${FREE_CUSTOM_LIST_CAP}`, premium: 'Unlimited' },
  ...(SHOW_MEDIA_SYNC_INTEGRATIONS
    ? [
        { label: 'Plex sync', free: false, premium: true },
        { label: 'Trakt sync (Netflix, Prime, Disney+…)', free: false, premium: true },
        { label: 'Automatic background sync', free: false, premium: true },
      ]
    : []),
];

const FAQS = [
  {
    q: 'Is the Free plan really free?',
    a: 'Yes. No credit card, no trial clock. Track as much as you want on Free for as long as you like.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Anytime, in one click from Settings. You keep Premium until the end of the period you already paid for.',
  },
  {
    q: 'What happens to my lists if I downgrade?',
    a: 'Nothing is deleted. Your lists stay exactly as they are. You just can’t create new ones past the free limit until you upgrade again.',
  },
  ...(SHOW_MEDIA_SYNC_INTEGRATIONS
    ? [{
        q: 'How does sync work?',
        a: 'Connect Plex or Trakt once and PLOT keeps your watchlist and history current automatically, including what you watch on Netflix, Prime, Disney+ and more.',
      }]
    : []),
];

function Tick() {
  return (
    <svg className="plan-tick" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Cell({ value }) {
  if (value === true) return <span className="cmp-yes" aria-label="Included"><Tick /></span>;
  if (value === false) return <span className="cmp-no" aria-label="Not included">—</span>;
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
          <Link to="/" className="plans-back">← Back</Link>
          <span className="plans-wordmark">PLOT</span>
        </header>

        <div className="plans-hero">
          <h1 className="plans-title">Do more with everything you watch</h1>
          <p className="plans-lede">
            Start free and keep every movie and show in one place. Go Premium for
            unlimited lists and automatic sync from every service you use.
          </p>

          <div className="billing-toggle" role="group" aria-label="Billing period">
            <button
              type="button"
              className={`billing-opt ${!annual ? 'is-active' : ''}`}
              aria-pressed={!annual}
              onClick={() => setBilling('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`billing-opt ${annual ? 'is-active' : ''}`}
              aria-pressed={annual}
              onClick={() => setBilling('annual')}
            >
              Annual
              <span className="billing-save">Save {ANNUAL_SAVING_PCT}%</span>
            </button>
          </div>
        </div>

        <div className="plans-grid">
          {/* Free */}
          <section className="plan-card">
            <div className="plan-card-head">
              <h2 className="plan-name">Free</h2>
              <div className="plan-price">
                <span className="plan-amount">$0</span>
                <span className="plan-per">forever</span>
              </div>
              <p className="plan-tagline">Everything you need to organise your watching.</p>
            </div>
            <ul className="plan-features">
              {FREE_HIGHLIGHTS.map(f => <li key={f}><Tick />{f}</li>)}
            </ul>
            <div className="plan-cta">
              {authState === 'signed-in' ? (
                <button className="btn btn-secondary" disabled>
                  {isPremium ? 'Included with Premium' : 'Your current plan'}
                </button>
              ) : (
                <Link to="/signup" className="btn btn-secondary">Get started free</Link>
              )}
            </div>
          </section>

          {/* Premium */}
          <section className="plan-card plan-card--premium">
            <span className="plan-flag">Recommended</span>
            <div className="plan-card-head">
              <h2 className="plan-name">Premium</h2>
              <div className="plan-price">
                <span className="plan-amount">A${annual ? ANNUAL_MONTHLY : MONTHLY_PRICE}</span>
                <span className="plan-per">/mo</span>
              </div>
              <p className="plan-billed">
                {annual
                  ? `Billed A$${ANNUAL_PRICE} yearly · save ${ANNUAL_SAVING_PCT}%`
                  : 'Billed monthly'}
              </p>
              <p className="plan-tagline">Everything in Free, plus:</p>
            </div>
            <ul className="plan-features">
              {PREMIUM_HIGHLIGHTS.map(f => <li key={f}><Tick />{f}</li>)}
            </ul>
            <div className="plan-cta">
              {authState === 'loading' ? (
                <button className="btn btn-primary" disabled>…</button>
              ) : isPremium ? (
                <button className="btn btn-secondary" onClick={premium.openPortal} disabled={premium.busy}>
                  {premium.busy ? 'Opening…' : 'Manage subscription'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={goPremium} disabled={premium.busy}>
                  {premium.busy ? '…' : 'Go Premium'}
                </button>
              )}
            </div>
          </section>
        </div>

        {isPremium && (
          <p className="plans-note plans-note--ok">You’re on PLOT Premium. Enjoy the full experience.</p>
        )}
        {premium.error && (
          <p className="plans-note plans-note--err">{premium.error}</p>
        )}

        {/* Full comparison */}
        <div className="cmp-wrap">
          <h2 className="cmp-title">Compare plans</h2>
          <div className="cmp-scroll">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th scope="col" className="cmp-feat">Feature</th>
                  <th scope="col">Free</th>
                  <th scope="col" className="cmp-prem">Premium</th>
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
          <h2 className="faq-title">Questions</h2>
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
          US, UK and euro customers have fixed local prices. Stripe converts prices for other supported locations at checkout.
          {' '}Cancel anytime. Payments are processed securely by Stripe.
          {' '}Need a hand? <a href="mailto:contact@theplot.tv">contact@theplot.tv</a>
        </p>

        <footer className="plans-foot">
          <Link to="/terms">Terms</Link>
          <span aria-hidden="true">·</span>
          <Link to="/privacy">Privacy</Link>
        </footer>
      </div>
    </div>
  );
}
