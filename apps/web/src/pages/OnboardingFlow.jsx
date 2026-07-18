import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { tmdb } from '../api/tmdb';
import { logoUrl, posterUrl } from '../App.jsx';
import PlotLoader from '../components/PlotLoader.jsx';
import { getButtonLikeProps } from '../utils/interactive.js';
import { track, markActivated, EVENTS } from '../lib/analytics.js';
import { saveOnboardingSeedTitles } from '@plot/core/onboarding.js';

const STEP_NAMES = { 1: 'region', 2: 'platforms', 3: 'seed' };

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
// Outer: fixed height flex column so the footer stays on screen
const page = {
  height: '100dvh',
  background: 'var(--bg)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

// Scrollable content area — fills remaining space above footer
const scrollArea = {
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  padding: '0 1.25rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

// Sticky footer that always stays on screen
const footer = {
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

  // Step 1: Region
  const [region, setRegion] = useState(guessRegion());

  // Step 2: Platforms
  const [providers,     setProviders]     = useState([]);
  const [allProviders,  setAllProviders]  = useState([]);
  const [loadingProv,   setLoadingProv]   = useState(false);
  const [provSearch,    setProvSearch]    = useState('');

  // Step 3: Seed shows (optional)
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

  const goNext = () => {
    track(EVENTS.ONBOARDING_STEP_COMPLETED, { step, step_name: STEP_NAMES[step] });
    setStep((s) => s + 1);
  };

  /* ── Load providers when moving to step 2 ── */
  useEffect(() => {
    if (step !== 2 || allProviders.length > 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- provider fetch toggles local loading state for this onboarding step
    setLoadingProv(true);
    tmdb.getWatchProvidersForRegion('tv', region).then(data => {
      const list = (data?.results || [])
        .sort((a, b) => a.display_priority - b.display_priority)
        .slice(0, 30);
      setAllProviders(list);
      setLoadingProv(false);
    });
  }, [step, region, allProviders.length]);

  /* ── Trending prefill for step 3 ── */
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
  const finish = async () => {
    if (!user) return;
    setSaving(true);

    const provPayload = allProviders
      .filter(p => providers.includes(p.provider_id))
      .map(p => ({ id: p.provider_id, name: p.provider_name, logo_path: p.logo_path }));

    // Detect device IANA timezone (e.g. "Australia/Sydney")
    let detectedTz = 'UTC';
    try { detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* unsupported */ }

    await supabase.from('profiles').upsert({
      id:                  user.id,
      region,
      timezone:            detectedTz,
      streaming_providers: provPayload,
      onboarding_complete: true,
    });

    // Seed selected titles into watching_progress or My List
    if (seedSelected.length > 0) {
      await saveOnboardingSeedTitles({ supabase, userId: user.id, items: seedSelected });
    }

    track(EVENTS.ONBOARDING_COMPLETED, {
      region,
      providers_count: providers.length,
      seed_titles_added: seedSelected.length,
    });
    // Completing onboarding is an activation signal (first-of wins).
    markActivated('onboarding', { seed_titles_added: seedSelected.length });

    navigate('/home', { replace: true });
  };

  const toggleProvider = (id) =>
    setProviders(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const toggleSeed = (item) => {
    const id = item.id;
    setSeedSelected(prev =>
      prev.some(i => i.id === id)
        ? prev.filter(i => i.id !== id)
        : [...prev, item]
    );
  };

  const filteredProviders = allProviders.filter(p =>
    p.provider_name.toLowerCase().includes(provSearch.toLowerCase())
  );

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
        <div style={{ width: '100%', maxWidth: 420, padding: '2rem 0 1.5rem', textAlign: 'center' }}>
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

        {/* ── Step 1: Region ── */}
        {step === 1 && (
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
                  onClick={() => setRegion(r.code)}
                  aria-pressed={region === r.code}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 2: Platforms ── */}
        {step === 2 && (
          <div style={card}>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.8rem', fontWeight: 500, letterSpacing: '-0.03em', marginBottom: '0.4rem', textAlign: 'center' }}>
              Your platforms
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5, textAlign: 'center' }}>
              Select the streaming services you subscribe to.
            </p>
            <input
              style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '0.82rem', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', outline: 'none', marginBottom: '1rem' }}
              placeholder="Search platforms…"
              value={provSearch}
              onChange={e => setProvSearch(e.target.value)}
            />
            {loadingProv ? (
              <div className="loading-state"><PlotLoader size="sm" /></div>
            ) : (
              <div className="providers-select-grid" style={{ padding: 0, paddingBottom: '1rem' }}>
                {filteredProviders.map(p => (
                  <div
                    key={p.provider_id}
                    className={`provider-select-card interactive-surface${providers.includes(p.provider_id) ? ' selected' : ''}`}
                    onClick={() => toggleProvider(p.provider_id)}
                    {...getButtonLikeProps({
                      onPress: () => toggleProvider(p.provider_id),
                      label: `${providers.includes(p.provider_id) ? 'Deselect' : 'Select'} ${p.provider_name}`,
                      pressed: providers.includes(p.provider_id),
                    })}
                  >
                    <img src={logoUrl(p.logo_path, 'w92')} alt={p.provider_name} />
                    <span>{p.provider_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Seed shows ── */}
        {step === 3 && (
          <div style={card}>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.8rem', fontWeight: 500, letterSpacing: '-0.03em', marginBottom: '0.4rem', textAlign: 'center' }}>
              What are you watching?
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5, textAlign: 'center' }}>
              Add a few titles to kick things off.
            </p>
            <input
              style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '0.82rem', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', outline: 'none', marginBottom: '0.4rem' }}
              placeholder="Search for a show or movie…"
              value={seedQuery}
              onChange={e => setSeedQuery(e.target.value)}
              autoFocus
            />
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.72rem', textAlign: 'center', padding: '0.2rem 0', marginBottom: '0.75rem', width: '100%' }} onClick={finish}>
              Skip this step
            </button>
            {seedSearching && <div className="loading-state" style={{ minHeight: 60 }}><PlotLoader size="sm" /></div>}
            {!seedQuery.trim() && trending.length > 0 && (
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Trending this week
              </div>
            )}
            {seedGridItems.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
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
            )}
            {seedSelected.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                  Added ({seedSelected.length})
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', paddingBottom: '0.5rem' }}>
                  {seedSelected.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.5rem 0.25rem 0.3rem', borderRadius: 'var(--radius-pill)', background: 'var(--accent-dim)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', fontSize: '0.76rem', fontWeight: 600, color: 'var(--accent)' }}>
                      <img src={posterUrl(item.poster_path, 'w92')} alt="" style={{ width: 18, height: 18, borderRadius: 3, objectFit: 'cover' }} />
                      {item.title || item.name}
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '0.85rem', padding: 0, lineHeight: 1 }} onClick={() => toggleSeed(item)}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Sticky footer — always visible ── */}
      <div style={footer}>
        <div style={{ width: '100%', maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: step > 1 ? 'space-between' : 'flex-end' }}>
            {step > 1 && (
              <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)}>← Back</button>
            )}
            <button
              className="btn btn-primary"
              onClick={step === 3 ? finish : goNext}
              disabled={saving}
              aria-busy={saving}
              aria-label={saving ? 'Setting up account' : step === 3 ? 'Start watching' : 'Continue'}
            >
              {step === 3 ? (saving ? <PlotLoader size="button" tone="dark" ariaHidden /> : 'Start watching →') : 'Continue →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
