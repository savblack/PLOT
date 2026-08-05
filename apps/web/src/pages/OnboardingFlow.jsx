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
import { posterUrl } from '../utils/images.js';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import Spinner from '../components/Spinner.jsx';
import { getButtonLikeProps } from '../utils/interactive.js';
import { track, markActivated, EVENTS } from '../lib/analytics.js';
import { COMMON } from '../copy/common.js';
import { ONBOARDING_FLOW } from '../copy/onboardingFlow.js';
import { getOrCreateMyListId, saveOnboardingSeedTitles } from '@plot/core/onboarding.js';
import { detectRegion, detectTimezone, guessRegionFromTimezone } from '@plot/core/region.js';
import { usePremium } from '../hooks/usePremium.js';
import { takePremiumCheckoutIntent } from '../utils/premiumCheckoutIntent.js';

const STEP_NAMES = { 1: 'name', 2: 'genres', 3: 'seed' };

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

  // Region is detected rather than asked for — see the effect below.
  const [region, setRegion] = useState(guessRegionFromTimezone);

  // Step 2: Genres
  const [genres,       setGenres]       = useState([]);
  const [allGenres,    setAllGenres]    = useState([]);
  const [loadingGenres, setLoadingGenres] = useState(false);

  // Step 3: Seed shows (optional). The step opens on an intro that says what
  // picking titles is for, and only reveals the poster grid once the user opts
  // in — the grid on its own read as a question about viewing history.
  const [seedIntro,    setSeedIntro]    = useState(true);
  const [seedQuery,    setSeedQuery]    = useState('');
  const [seedResults,  setSeedResults]  = useState([]);
  const [seedSelected, setSeedSelected] = useState([]);
  const [seedSearching, setSeedSearching] = useState(false);
  const [trending,     setTrending]     = useState([]);

  const TOTAL = 3;

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

  const goNext = ({ skipped = false } = {}) => {
    track(EVENTS.ONBOARDING_STEP_COMPLETED, { step, step_name: STEP_NAMES[step], skipped });
    setStep((s) => s + 1);
  };

  // Skipping discards what was picked on the step being skipped — otherwise
  // "Skip this step" saves the same selections Continue does, which is not
  // what anyone means by skipping.
  const skipStep = () => {
    if (step === TOTAL) return finish({ skipSeeds: true });
    setGenres([]);
    return goNext({ skipped: true });
  };

  /* ── Refine the timezone-based region guess with IP geolocation ── */
  useEffect(() => {
    let alive = true;
    detectRegion({ endpoint: '/api/region' }).then(detected => {
      if (alive) setRegion(detected);
    });
    return () => { alive = false; };
  }, []);

  /* ── Load genres when moving to step 2 ── */
  useEffect(() => {
    if (step !== 2 || allGenres.length > 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- genre fetch toggles local loading state for this onboarding step
    setLoadingGenres(true);
    tmdb.getGenres().then(list => {
      setAllGenres(list || []);
      setLoadingGenres(false);
    });
  }, [step, allGenres.length]);

  /* ── Trending prefill for step 3 — starts during the intro so the grid is
       already populated the moment the user opts in ── */
  useEffect(() => {
    if (step !== 3 || trending.length > 0) return;
    tmdb.getTrending('all', 'week').then(data => {
      const list = (data?.results || [])
        .filter(r => (r.media_type === 'tv' || r.media_type === 'movie') && r.poster_path)
        .slice(0, 24);
      setTrending(list);
    });
  }, [step, trending.length]);

  /* ── Seed search ── */
  useEffect(() => {
    if (step !== 3 || !seedQuery.trim()) {
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
  const finish = async ({ skipSeeds = false } = {}) => {
    if (!user) return;
    setSaving(true);
    setSaveError(null);

    const seeds = skipSeeds ? [] : seedSelected;

    const genrePayload = allGenres.filter(g => genres.includes(g.id)).map(g => g.name);

    const { error: profileError } = await supabase.from('profiles').upsert({
      id:                  user.id,
      first_name:          firstName.trim(),
      region,
      timezone:            detectTimezone(),
      genres:              genrePayload,
      onboarding_complete: true,
    });

    if (profileError) {
      // Don't navigate to /home on a failed write — ProtectedRoute would just
      // bounce the user back here since onboarding_complete never got set,
      // leaving them stuck in a neither-done-nor-in-flow loop.
      setSaving(false);
      setSaveError(ONBOARDING_FLOW.saveError);
      return;
    }

    // Always create My List so Save works immediately, even if the user
    // skipped seeding titles.
    await getOrCreateMyListId({ supabase, userId: user.id });

    // Seed selected titles into My List, the same list the watchlist Save
    // action writes to, so what the step promises is where they land.
    if (seeds.length > 0) {
      await saveOnboardingSeedTitles({ supabase, userId: user.id, items: seeds });
    }

    track(EVENTS.ONBOARDING_COMPLETED, {
      region,
      genres_count: genres.length,
      seed_titles_added: seeds.length,
      skipped: skipSeeds,
    });
    // Completing onboarding is an activation signal (first-of wins).
    markActivated('onboarding', { seed_titles_added: seeds.length });

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

  // The intro owns the footer while it's up: its CTA reveals the poster grid
  // instead of completing onboarding, and its secondary link leaves for the app
  // rather than skipping a single step.
  const onSeedIntro = step === 3 && seedIntro;
  const ctaText  = onSeedIntro ? ONBOARDING_FLOW.step3.intro.ctaArrow
    : step === TOTAL ? ONBOARDING_FLOW.startWatchingArrow : ONBOARDING_FLOW.continueArrow;
  const ctaLabel = onSeedIntro ? ONBOARDING_FLOW.step3.intro.cta
    : step === TOTAL ? ONBOARDING_FLOW.startWatching : COMMON.continue;
  const secondaryLabel = onSeedIntro ? ONBOARDING_FLOW.step3.intro.toApp : ONBOARDING_FLOW.skipThisStep;

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
            <button type="button" className="onboarding-back" onClick={() => (step === 3 && !seedIntro ? setSeedIntro(true) : setStep(s => s - 1))} aria-label={ONBOARDING_FLOW.goBack} style={{ marginTop: '0.4rem' }}>
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
              {ONBOARDING_FLOW.stepLabel(step, TOTAL)}
            </div>
          </div>
          <div style={{ width: 28, flexShrink: 0 }} />
        </div>

        {/* ── Step 1: First name ── */}
        {step === 1 && (
          <div style={card}>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.8rem', fontWeight: 500, letterSpacing: '-0.03em', marginBottom: '0.4rem', textAlign: 'center' }}>
              {ONBOARDING_FLOW.step1.title}
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5, textAlign: 'center' }}>
              {ONBOARDING_FLOW.step1.subtitle}
            </p>
            <input
              style={{ width: '100%', padding: '0.7rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '0.9rem', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', outline: 'none' }}
              placeholder={ONBOARDING_FLOW.step1.placeholder}
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {/* ── Step 2: Genres ── */}
        {step === 2 && (
          <div style={card}>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.8rem', fontWeight: 500, letterSpacing: '-0.03em', marginBottom: '0.4rem', textAlign: 'center' }}>
              {ONBOARDING_FLOW.step2.title}
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5, textAlign: 'center' }}>
              {ONBOARDING_FLOW.step2.subtitle}
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
                      label: `${genres.includes(g.id) ? ONBOARDING_FLOW.deselect : ONBOARDING_FLOW.select} ${g.name}`,
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

        {/* ── Step 3a: Seed intro ── */}
        {step === 3 && seedIntro && (
          <div style={{ ...card, textAlign: 'center', paddingTop: '1.5rem' }}>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.8rem', fontWeight: 500, letterSpacing: '-0.03em', marginBottom: '1.25rem' }}>
              {ONBOARDING_FLOW.step3.intro.greeting(firstName.trim())}
            </h1>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '1rem', lineHeight: 1.5 }}>
              {ONBOARDING_FLOW.step3.intro.lead}
            </p>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              {ONBOARDING_FLOW.step3.intro.pitch}
            </p>
          </div>
        )}

        {/* ── Step 3b: Seed shows ── */}
        {step === 3 && !seedIntro && (
          <div style={card}>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.8rem', fontWeight: 500, letterSpacing: '-0.03em', marginBottom: '0.4rem', textAlign: 'center' }}>
              {ONBOARDING_FLOW.step3.title}
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5, textAlign: 'center' }}>
              {ONBOARDING_FLOW.step3.subtitle}
            </p>
            <div style={{ position: 'relative', marginBottom: '0.4rem' }}>
              <input
                style={{ width: '100%', padding: '0.65rem 2.25rem 0.65rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '0.82rem', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', outline: 'none' }}
                placeholder={ONBOARDING_FLOW.step3.searchPlaceholder}
                value={seedQuery}
                onChange={e => setSeedQuery(e.target.value)}
                autoFocus
              />
              {seedQuery && (
                <button type="button" className="search-input-clear" onClick={() => setSeedQuery('')} aria-label={ONBOARDING_FLOW.clearSearch}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
            {seedSearching && <div className="loading-state" style={{ minHeight: 60 }}><PlotLoader size="sm" /></div>}
            {!seedQuery.trim() && trending.length > 0 && (
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                {ONBOARDING_FLOW.step3.trendingThisWeek}
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
                        label: `${sel ? ONBOARDING_FLOW.step3.remove : ONBOARDING_FLOW.step3.add} ${item.title || item.name || ONBOARDING_FLOW.untitled}`,
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
            onClick={() => {
              if (onSeedIntro) return setSeedIntro(false);
              return step === TOTAL ? finish() : goNext();
            }}
            disabled={saving || (step === 1 && !firstName.trim())}
            aria-busy={saving}
            aria-label={saving ? ONBOARDING_FLOW.settingUpAccount : ctaLabel}
          >
            {saving ? <Spinner size="button" ariaHidden /> : ctaText}
          </button>
          {(step === 2 || step === TOTAL) && !saving && (
            <button type="button" className="onboarding-skip" onClick={skipStep}>{secondaryLabel}</button>
          )}
        </div>
      </div>
    </div>
  );
}
