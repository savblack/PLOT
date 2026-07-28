import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { tmdb } from '../api/tmdb';
// This route renders outside the App-shell layout, but reuses several of its
// classes (onboarding-cta, interactive-surface, providers-select-grid, ...).
// Its named import from App.jsx doesn't pull in App's CSS on its own (that
// only rides along on App.jsx's own lazy-loaded chunk), so import app.css
// explicitly — Vite dedupes it against App's stylesheet rather than doubling it.
import '../styles/app.css';
import { posterUrl } from '../App.jsx';
import PlotLoader from '../components/PlotLoader.jsx';
import Spinner from '../components/Spinner.jsx';
import { getButtonLikeProps } from '../utils/interactive.js';
import { track, markActivated, EVENTS } from '../lib/analytics.js';
import { getOrCreateMyListId, saveOnboardingSeedTitles } from '@plot/core/onboarding.js';
import { usePremium } from '../hooks/usePremium.js';
import { takePremiumCheckoutIntent } from '../utils/premiumCheckoutIntent.js';

const STEP_NAMES = { 1: 'name', 2: 'region', 3: 'genres', 4: 'seed' };

/* ── Timezone → region guess ── */
const TZ_MAP = {
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'Europe/London': 'GB', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Singapore': 'SG',
  'Pacific/Auckland': 'NZ',
};

function guessRegion() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.startsWith('Australia/')) return 'AU';
    return TZ_MAP[tz] || 'US';
  } catch { return 'US'; }
}

const REGIONS = [
  { code: 'US', name: 'United States' }, { code: 'AU', name: 'Australia' },
  { code: 'GB', name: 'United Kingdom' }, { code: 'CA', name: 'Canada' },
  { code: 'NZ', name: 'New Zealand' },   { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },       { code: 'JP', name: 'Japan' },
  { code: 'IN', name: 'India' },         { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },        { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },         { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },        { code: 'SG', name: 'Singapore' },
];

/* ── Shared styles ── */
// Outer: grows with content instead of forcing full-viewport height, so short
// steps (e.g. a filtered platform search with few results) don't leave a
// block of empty page background above the footer.
const page = {
  minHeight: '100dvh',
  background: 'var(--bg)',
  display: 'flex',
  flexDirection: 'column',
};

// Content area — sized to its content, not stretched to fill the page.
const scrollArea = {
  padding: '0 1.25rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

// Sticky footer: hugs the content when it's short, pins to the viewport
// bottom once the page scrolls past it.
const footer = {
  position: 'sticky',
  bottom: 0,
  flexShrink: 0,
  padding: '0.75rem 1.25rem',
  paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
  background: 'var(--bg)',
  borderTop: 'none',
  width: '100%',
};

const card = {
  width: '100%',
  maxWidth: 420,
  margin: '0 auto',
};

export default function OnboardingFlow() {
  const navigate = useNavigate();

  const [user,      setUser]      = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [step,      setStep]      = useState(1);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState(null);
  const premium = usePremium(null);

  // Step 1: First name
  const [firstName, setFirstName] = useState('');

  // Step 2: Region
  const [region, setRegion] = useState(guessRegion());
  const regionTouched = useRef(false);

  // Step 3: Genres
  const [genres,       setGenres]       = useState([]);
  const [allGenres,    setAllGenres]    = useState([]);
  const [loadingGenres, setLoadingGenres] = useState(false);

  // Step 4: Seed shows (optional)
  const [seedQuery,    setSeedQuery]    = useState('');
  const [seedResults,  setSeedResults]  = useState([]);
  const [seedSelected, setSeedSelected] = useState([]);
  const [seedSearching, setSeedSearching] = useState(false);
  const [trending,     setTrending]     = useState([]);

  const TOTAL = 4;

  /* ── Auth check ── */
  useEffect(() => {
    let alive = true;

    const syncUser = (session) => {
      if (!alive) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => syncUser(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      syncUser(session);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  /* ── Activation funnel: fire once the authed user reaches onboarding ── */
  const startedRef = useRef(false);
  useEffect(() => {
    if (user && !startedRef.current) {
      startedRef.current = true;
      track(EVENTS.ONBOARDING_STARTED);
    }
  }, [user]);

  const goNext = () => {
    track(EVENTS.ONBOARDING_STEP_COMPLETED, { step, step_name: STEP_NAMES[step] });
    setStep((s) => s + 1);
  };

  /* ── Refine the timezone-based region guess with IP geolocation ── */
  useEffect(() => {
    fetch('/api/region')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (regionTouched.current || !data?.country) return;
        if (REGIONS.some(r => r.code === data.country)) setRegion(data.country);
      })
      .catch(() => { /* keep the timezone guess */ });
  }, []);

  /* ── Load genres when moving to step 3 ── */
  useEffect(() => {
    if (step !== 3 || allGenres.length > 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- genre fetch toggles local loading state for this onboarding step
    setLoadingGenres(true);
    tmdb.getGenres().then(list => {
      setAllGenres(list || []);
      setLoadingGenres(false);
    });
  }, [step, allGenres.length]);

  /* ── Trending prefill for step 4 ── */
  useEffect(() => {
    if (step !== 4 || trending.length > 0) return;
    tmdb.getTrending('all', 'week').then(data => {
      const list = (data?.results || [])
        .filter(r => (r.media_type === 'tv' || r.media_type === 'movie') && r.poster_path)
        .slice(0, 24);
      setTrending(list);
    });
  }, [step, trending.length]);

  /* ── Seed search ── */
  useEffect(() => {
    if (step !== 4 || !seedQuery.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear transient onboarding search results when the query is empty
      setSeedResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSeedSearching(true);
      const data = await tmdb.search(seedQuery);
      const hits = (data?.results || [])
        .filter(r => r.media_type === 'tv' || r.media_type === 'movie')
        .filter(r => r.poster_path)
        .slice(0, 24);
      setSeedResults(hits);
      setSeedSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [seedQuery, step]);

  /* ── Save and complete ── */
  const finish = async () => {
    if (!user) return;
    setSaving(true);
    setSaveError(null);

    const genrePayload = allGenres.filter(g => genres.includes(g.id)).map(g => g.name);

    // Detect device IANA timezone (e.g. "Australia/Sydney")
    let detectedTz = 'UTC';
    try { detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* unsupported */ }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id:                  user.id,
      first_name:          firstName.trim(),
      region,
      timezone:            detectedTz,
      genres:              genrePayload,
      onboarding_complete: true,
    });

    if (profileError) {
      // Don't navigate to /home on a failed write — ProtectedRoute would just
      // bounce the user back here since onboarding_complete never got set,
      // leaving them stuck in a neither-done-nor-in-flow loop.
      setSaving(false);
      setSaveError('Something went wrong saving your setup. Please try again.');
      return;
    }

    // Always create My List so Save works immediately, even if the user
    // skipped seeding titles.
    await getOrCreateMyListId({ supabase, userId: user.id });

    // Seed selected titles into watching_progress or My List
    if (seedSelected.length > 0) {
      await saveOnboardingSeedTitles({ supabase, userId: user.id, items: seedSelected });
    }

    track(EVENTS.ONBOARDING_COMPLETED, {
      region,
      genres_count: genres.length,
      seed_titles_added: seedSelected.length,
    });
    // Completing onboarding is an activation signal (first-of wins).
    markActivated('onboarding', { seed_titles_added: seedSelected.length });

    const plan = takePremiumCheckoutIntent();
    if (plan) {
      const started = await premium.startCheckout(plan, 'premium_signup');
        if (!started) navigate(`/pricing?billing=${plan}`, { replace: true });
      return;
    }

    navigate('/home', { replace: true });
  };

  const toggleGenre = (id) =>
    setGenres(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const toggleSeed = (item) => {
    const id = item.id;
    setSeedSelected(prev =>
      prev.some(i => i.id === id)
        ? prev.filter(i => i.id !== id)
        : [...prev, item]
    );
  };

  const seedGridItems = seedQuery.trim() ? seedResults : trending;

  if (authLoading) {
    return (
      <div className="app-boot-loader">
        <PlotLoader />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div style={page}>
      {/* ── Scrollable content ── */}
      <div style={scrollArea}>
        {/* Header */}
        <div style={{ width: '100%', maxWidth: 420, padding: '2rem 0 1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
          {step > 1 ? (
            <button type="button" className="onboarding-back" onClick={() => setStep(s => s - 1)} aria-label="Go back" style={{ marginTop: '0.4rem' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          ) : <div style={{ width: 28, flexShrink: 0 }} />}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 500, letterSpacing: '-0.05em', textTransform: 'uppercase', marginBottom: '1.5rem' }}>
              PLOT
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginBottom: '0.6rem' }}>
              {Array.from({ length: TOTAL }, (_, i) => (
                <div key={i} style={{ flex: 1, maxWidth: 60, height: 3, borderRadius: 2, background: i < step ? 'var(--accent)' : 'var(--border)', transition: 'background 0.3s ease' }} />
              ))}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Step {step} of {TOTAL}
            </div>
          </div>
          <div style={{ width: 28, flexShrink: 0 }} />
        </div>

        {/* ── Step 1: First name ── */}
        {step === 1 && (
          <div style={card}>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.8rem', fontWeight: 500, letterSpacing: '-0.03em', marginBottom: '0.4rem', textAlign: 'center' }}>
              What's your name?
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5, textAlign: 'center' }}>
              So we can make PLOT yours.
            </p>
            <input
              style={{ width: '100%', padding: '0.7rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '0.9rem', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', outline: 'none' }}
              placeholder="First name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {/* ── Step 2: Region ── */}
        {step === 2 && (
          <div style={card}>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.8rem', fontWeight: 500, letterSpacing: '-0.03em', marginBottom: '0.4rem', textAlign: 'center' }}>
              Where are you?
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5, textAlign: 'center' }}>
              We use this to show content available in your region.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', paddingBottom: '1rem' }}>
              {REGIONS.map(r => (
                <button
                  key={r.code}
                  style={{
                    padding: '0.7rem 0.9rem',
                    borderRadius: 'var(--radius-md)',
                    border: region === r.code ? '2px solid var(--accent)' : '1.5px solid var(--border)',
                    background: region === r.code ? 'var(--accent-dim)' : 'var(--surface)',
                    color: region === r.code ? 'var(--accent)' : 'var(--text-primary)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => { regionTouched.current = true; setRegion(r.code); }}
                  aria-pressed={region === r.code}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Genres ── */}
        {step === 3 && (
          <div style={card}>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.8rem', fontWeight: 500, letterSpacing: '-0.03em', marginBottom: '0.4rem', textAlign: 'center' }}>
              What do you like?
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5, textAlign: 'center' }}>
              Pick a few to shape what we recommend.
            </p>
            {loadingGenres ? (
              <div className="loading-state"><PlotLoader size="sm" /></div>
            ) : (
              <div style={{ maxHeight: '50vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '1rem', paddingRight: '0.15rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem' }}>
                {allGenres.map(g => (
                  <div
                    key={g.id}
                    className={`interactive-surface${genres.includes(g.id) ? ' selected' : ''}`}
                    onClick={() => toggleGenre(g.id)}
                    style={{
                      padding: '0.55rem 1rem',
                      borderRadius: 'var(--radius-pill)',
                      border: genres.includes(g.id) ? '2px solid var(--accent)' : '1.5px solid var(--border)',
                      background: genres.includes(g.id) ? 'var(--accent-dim)' : 'var(--surface)',
                      color: genres.includes(g.id) ? 'var(--accent)' : 'var(--text-primary)',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    {...getButtonLikeProps({
                      onPress: () => toggleGenre(g.id),
                      label: `${genres.includes(g.id) ? 'Deselect' : 'Select'} ${g.name}`,
                      pressed: genres.includes(g.id),
                    })}
                  >
                    {g.name}
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Seed shows ── */}
        {step === 4 && (
          <div style={card}>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.8rem', fontWeight: 500, letterSpacing: '-0.03em', marginBottom: '0.4rem', textAlign: 'center' }}>
              What are you watching?
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5, textAlign: 'center' }}>
              Give your watchlist a head start.
            </p>
            <div style={{ position: 'relative', marginBottom: '0.4rem' }}>
              <input
                style={{ width: '100%', padding: '0.65rem 2.25rem 0.65rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '0.82rem', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', outline: 'none' }}
                placeholder="Search for a show or movie…"
                value={seedQuery}
                onChange={e => setSeedQuery(e.target.value)}
                autoFocus
              />
              {seedQuery && (
                <button type="button" className="search-input-clear" onClick={() => setSeedQuery('')} aria-label="Clear search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
            {seedSearching && <div className="loading-state" style={{ minHeight: 60 }}><PlotLoader size="sm" /></div>}
            {!seedQuery.trim() && trending.length > 0 && (
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Trending this week
              </div>
            )}
            {seedGridItems.length > 0 && (
              <div style={{ maxHeight: '42vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '0.75rem', paddingRight: '0.15rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {seedGridItems.map(item => {
                  const sel = seedSelected.some(i => i.id === item.id);
                  return (
                    <div
                      key={item.id}
                      className="interactive-surface"
                      onClick={() => toggleSeed(item)}
                      style={{ cursor: 'pointer', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: sel ? '2px solid var(--accent)' : '2px solid transparent', position: 'relative', transition: 'border-color 0.15s ease' }}
                      {...getButtonLikeProps({
                        onPress: () => toggleSeed(item),
                        label: `${sel ? 'Deselect' : 'Select'} ${item.title || item.name || 'title'}`,
                        pressed: sel,
                      })}
                    >
                      <div style={{ aspectRatio: '2/3', background: 'var(--surface-raised)' }}>
                        <img src={posterUrl(item.poster_path, 'w185')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </div>
                      {sel && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(224,85,120,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: 'white', fontSize: '1.5rem' }}>✓</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Sticky footer — always visible ── */}
      <div style={footer}>
        <div style={{ width: '100%', maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
          {saveError && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--accent)', textAlign: 'center' }}>{saveError}</p>
          )}
          <button
            className="onboarding-cta"
            onClick={step === TOTAL ? finish : goNext}
            disabled={saving || (step === 1 && !firstName.trim()) || (step === 3 && genres.length === 0)}
            aria-busy={saving}
            aria-label={saving ? 'Setting up account' : step === TOTAL ? 'Start watching' : 'Continue'}
          >
            {step === TOTAL ? (saving ? <Spinner size="button" ariaHidden /> : 'Start watching →') : 'Continue →'}
          </button>
          {step === TOTAL && !saving && (
            <button type="button" className="onboarding-skip" onClick={finish}>Skip this step</button>
          )}
        </div>
      </div>
    </div>
  );
}
