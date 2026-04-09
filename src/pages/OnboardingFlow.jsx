import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { tmdb } from '../api/tmdb';
import { GENRES, REGIONS, TIMEZONE_TO_REGION } from '../constants';
import ImportModal from '../components/ImportModal';
import PlotLoader from '../components/PlotLoader';
import './OnboardingFlow.css';

const TOTAL_STEPS = 5;

const timezoneToRegion = (tz) => {
  if (tz.startsWith('Australia/')) return 'AU';
  return TIMEZONE_TO_REGION[tz] ?? null;
};

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [step, setStep] = useState(1);

  // Step 1 — Username
  const [username, setUsername] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameError, setUsernameError] = useState('');

  // Step 2 — Genres
  const [selectedGenres, setSelectedGenres] = useState([]);

  // Step 3 — Region
  const [selectedRegion, setSelectedRegion] = useState('US');
  const [regionDropdownOpen, setRegionDropdownOpen] = useState(false);
  const regionDropdownRef = useRef(null);
  const chipsScrollRef = useRef(null);
  const [chipsScroll, setChipsScroll] = useState({ left: false, right: false });
  const resultsScrollRef = useRef(null);
  const [resultsScrolled, setResultsScrolled] = useState(false);

  // Step 4 — Streaming Providers
  const [providers, setProviders] = useState([]);
  const [allProviders, setAllProviders] = useState([]);
  const [selectedProviders, setSelectedProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [providerSearchResults, setProviderSearchResults] = useState([]);

  // Step 5 — Seed titles
  const [seedQuery, setSeedQuery] = useState('');
  const [seedResults, setSeedResults] = useState([]);
  const [seedTitles, setSeedTitles] = useState([]);
  const [searchingSeeds, setSearchingSeeds] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Completion
  const [saving, setSaving] = useState(false);
  const [personalizing, setPersonalizing] = useState(false);

  // Init: verify auth, auto-detect region, check if already onboarded
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/login', { replace: true }); return; }
      setUser(session.user);

      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const guess = timezoneToRegion(tz);
        if (guess) setSelectedRegion(guess);
      } catch (_) {}

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_complete, username')
        .eq('id', session.user.id)
        .single();

      if (profile?.onboarding_complete) {
        navigate('/app', { replace: true });
        return;
      }
      if (profile?.username) setUsername(profile.username);
    };
    init();
  }, []);

  // Debounced username uniqueness check
  useEffect(() => {
    if (!username) { setUsernameError(''); return; }
    const timer = setTimeout(async () => {
      setUsernameChecking(true);
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .neq('id', user?.id || 'none')
        .maybeSingle();
      setUsernameError(data ? 'Username taken' : '');
      setUsernameChecking(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [username, user?.id]);

  const updateResultsScroll = useCallback(() => {
    const el = resultsScrollRef.current;
    if (!el) return;
    setResultsScrolled(el.scrollTop > 0);
  }, []);

  useEffect(() => {
    setResultsScrolled(false);
  }, [seedResults]);

  const updateChipsScroll = useCallback(() => {
    const el = chipsScrollRef.current;
    if (!el) return;
    setChipsScroll({
      left: el.scrollLeft > 0,
      right: el.scrollLeft < el.scrollWidth - el.clientWidth - 1,
    });
  }, []);

  // Recalculate when chips change
  useEffect(() => {
    updateChipsScroll();
  }, [seedTitles]);

  // Close region dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (regionDropdownRef.current && !regionDropdownRef.current.contains(e.target)) {
        setRegionDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch streaming providers when entering step 4
  useEffect(() => {
    if (step !== 4 || providers.length > 0 || loadingProviders) return;
    const fetchProviders = async () => {
      setLoadingProviders(true);
      const data = await tmdb.getWatchProvidersForRegion('movie', selectedRegion);
      if (data?.results) {
        const sorted = [...data.results].sort((a, b) => a.display_priority - b.display_priority);
        setProviders(sorted.slice(0, 12));
        setAllProviders(sorted);
      }
      setLoadingProviders(false);
    };
    fetchProviders();
  }, [step]);

  // Filter full provider list by search query
  useEffect(() => {
    if (!providerSearch.trim()) { setProviderSearchResults([]); return; }
    const q = providerSearch.toLowerCase();
    setProviderSearchResults(
      allProviders
        .filter(p => !providers.some(top => top.provider_id === p.provider_id))
        .filter(p => p.provider_name.toLowerCase().includes(q))
        .slice(0, 6)
    );
  }, [providerSearch, allProviders]);

  // Debounced TMDB search for seed titles
  useEffect(() => {
    if (!seedQuery.trim()) { setSeedResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchingSeeds(true);
      const data = await tmdb.search(seedQuery);
      if (data?.results) {
        setSeedResults(
          data.results
            .filter(r => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path)
            .slice(0, 6)
        );
      }
      setSearchingSeeds(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [seedQuery]);

  const toggleGenre = (key) => {
    setSelectedGenres(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const toggleProvider = (p) => {
    const id = p.provider_id;
    setSelectedProviders(prev => {
      if (prev.find(x => x.id === id)) return prev.filter(x => x.id !== id);
      return [...prev, { id, name: p.provider_name, logo_path: p.logo_path }];
    });
  };

  const toggleSeedTitle = (item) => {
    const isSelected = seedTitles.some(t => t.id === item.id);
    if (isSelected) {
      setSeedTitles(prev => prev.filter(t => t.id !== item.id));
    } else {
      setSeedTitles(prev => [...prev, {
        id: item.id,
        title: item.title || item.name,
        media_type: item.media_type,
        poster_path: item.poster_path,
      }]);
    }
  };

  const canProceed = () => {
    if (step === 1) return !usernameChecking && !usernameError;
    if (step === 2) return selectedGenres.length >= 3;
    return true;
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS) setStep(s => s + 1);
    else handleComplete();
  };

  const handleComplete = async () => {
    if (!user) return;
    setSaving(true);

    await supabase.from('profiles').upsert({
      id: user.id,
      username: username || null,
      genres: selectedGenres,
      region: selectedRegion,
      streaming_providers: selectedProviders,
      onboarding_complete: true,
    });

    if (seedTitles.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const entries = seedTitles.map(t => ({
        user_id: user.id,
        tmdb_id: t.id,
        media_type: t.media_type,
        title: t.title,
        poster_path: t.poster_path,
        watched_at: today,
      }));
      await supabase.from('journal').upsert(entries, { onConflict: 'user_id, tmdb_id' });
    }

    setSaving(false);
    setPersonalizing(true);

    setTimeout(() => navigate('/app', { replace: true }), 2000);
  };

  // ── Personalizing splash ─────────────────────────────────
  if (personalizing) {
    return (
      <div className="onboarding-personalizing">
        <PlotLoader />
        <div>
          <h2>Creating your taste profile</h2>
        </div>
      </div>
    );
  }

  const progressPct = (step / TOTAL_STEPS) * 100;

  return (
    <div className="onboarding-page">
      {/* Header */}
      <div className="onboarding-header">
        <img src="/plot-logo.svg" alt="PLOT" className="onboarding-logo" />
        <div className="onboarding-progress-row">
          <span className="onboarding-step-label">{step} / {TOTAL_STEPS}</span>
          <div className="onboarding-progress">
            <div className="onboarding-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="onboarding-content">

        {/* Step 1 — Username */}
        {step === 1 && (
          <div>
            <h1 className="onboarding-step-heading">What should we call you?</h1>
            <p className="onboarding-step-sub">
              Choose a username for your public profile. You can change this any time.
            </p>
            <div className={`onboarding-input-wrap${usernameError ? ' has-error' : ''}`}>
              <span className="onboarding-input-prefix">@</span>
              <input
                type="text"
                placeholder="yourname"
                value={username}
                autoFocus
                maxLength={30}
                onChange={e =>
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                }
              />
              {usernameChecking && (
                <span className="onboarding-input-status">checking…</span>
              )}
              {!usernameChecking && username && !usernameError && (
                <span className="onboarding-input-status" style={{ color: '#2d7a2d' }}>✓</span>
              )}
            </div>
            {usernameError && (
              <p className="onboarding-field-error">{usernameError}</p>
            )}
            <button className="onboarding-skip-link" onClick={() => setStep(2)}>
              Skip for now
            </button>
          </div>
        )}

        {/* Step 2 — Genres */}
        {step === 2 && (
          <div>
            <h1 className="onboarding-step-heading">What floats your boat?</h1>
            <p className="onboarding-step-sub">
              Tell us what you're into and we'll find something worth watching.
            </p>
            {selectedGenres.length > 0 && (
              <p className={`onboarding-hint${selectedGenres.length >= 3 ? ' met' : ''}`}>
                {selectedGenres.length >= 3 ? 'Nice taste! Select more or continue.' : 'Pick at least 3. The more the better.'}
              </p>
            )}
            <div className="onboarding-genre-grid">
              {GENRES.map(g => (
                <button
                  key={g.key}
                  className={`onboarding-toggle-card${selectedGenres.includes(g.key) ? ' selected' : ''}`}
                  onClick={() => toggleGenre(g.key)}
                >
                  <span className="onboarding-card-label">{g.label}</span>
                  <span className="onboarding-card-desc">{g.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Region */}
        {step === 3 && (
          <div>
            <h1 className="onboarding-step-heading">Where are you based?</h1>
            <p className="onboarding-step-sub">
              Sets your streaming options and release dates.
            </p>
            <div className="onboarding-dropdown" ref={regionDropdownRef}>
              <button
                className={`onboarding-dropdown-trigger${regionDropdownOpen ? ' open' : ''}`}
                onClick={() => setRegionDropdownOpen(v => !v)}
              >
                <span>{REGIONS.find(r => r.code === selectedRegion)?.name}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {regionDropdownOpen && (
                <div className="onboarding-dropdown-menu">
                  {REGIONS.map(r => (
                    <button
                      key={r.code}
                      className={`onboarding-dropdown-item${selectedRegion === r.code ? ' selected' : ''}`}
                      onClick={() => { setSelectedRegion(r.code); setRegionDropdownOpen(false); }}
                    >
                      {r.name}
                      <span className="onboarding-dropdown-code">{r.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4 — Streaming Providers */}
        {step === 4 && (
          <div>
            <h1 className="onboarding-step-heading">What are you subscribed to?</h1>
            <p className="onboarding-step-sub">
              Your subscriptions shape your feed and help us suggest what to try next.
            </p>
            {loadingProviders && (
              <div className="onboarding-providers-loading">
                <div className="onboarding-spinner-dark" />
                Loading providers…
              </div>
            )}
            {!loadingProviders && providers.length === 0 && (
              <p className="onboarding-providers-empty">
                No providers found for your region — you can skip this step.
              </p>
            )}
            {!loadingProviders && providers.length > 0 && (
              <>
                <div className="onboarding-provider-grid">
                  {providers.map(p => {
                    const isSelected = selectedProviders.some(x => x.id === p.provider_id);
                    return (
                      <button
                        key={p.provider_id}
                        className={`onboarding-provider-card${isSelected ? ' selected' : ''}`}
                        onClick={() => toggleProvider(p)}
                      >
                        <img
                          className="onboarding-provider-logo"
                          src={`https://image.tmdb.org/t/p/w92${p.logo_path}`}
                          alt={p.provider_name}
                        />
                        <span className="onboarding-provider-name">{p.provider_name}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="onboarding-provider-search-wrap">
                  <svg className="onboarding-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    className="onboarding-search-input"
                    type="text"
                    placeholder="Search for another service…"
                    value={providerSearch}
                    onChange={e => setProviderSearch(e.target.value)}
                  />
                </div>

                {providerSearchResults.length > 0 && (
                  <div className="onboarding-provider-search-results">
                    {providerSearchResults.map(p => {
                      const isSelected = selectedProviders.some(x => x.id === p.provider_id);
                      return (
                        <button
                          key={p.provider_id}
                          className={`onboarding-seed-result${isSelected ? ' selected' : ''}`}
                          onClick={() => toggleProvider(p)}
                        >
                          <img
                            className="onboarding-provider-logo"
                            src={`https://image.tmdb.org/t/p/w92${p.logo_path}`}
                            alt={p.provider_name}
                          />
                          <div className="onboarding-seed-info">
                            <div className="onboarding-seed-title">{p.provider_name}</div>
                          </div>
                          <div className="onboarding-seed-check">
                            {isSelected && (
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                                <polyline points="1.5 6 4.5 9 10.5 3" />
                              </svg>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 5 — Seed Titles */}
        {step === 5 && (
          <div>
            <h1 className="onboarding-step-heading">What have you loved lately?</h1>
            <p className="onboarding-step-sub">
              A few favourites tell us everything.
            </p>

            {seedTitles.length > 0 && (
              <div className={`onboarding-seeds-chips-wrap${chipsScroll.left ? ' show-left-fade' : ''}${chipsScroll.right ? ' show-right-fade' : ''}`}>
              <div className="onboarding-seeds-chips" ref={chipsScrollRef} onScroll={updateChipsScroll}>
                {seedTitles.map(t => (
                  <div key={t.id} className="onboarding-seed-chip">
                    {t.title}
                    <button onClick={() => toggleSeedTitle(t)} aria-label="Remove">×</button>
                  </div>
                ))}
              </div>
              </div>
            )}

            <div className="onboarding-search-wrap">
              <svg className="onboarding-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                className="onboarding-search-input"
                type="text"
                placeholder="Search for a movie or show…"
                value={seedQuery}
                autoFocus
                onChange={e => setSeedQuery(e.target.value)}
              />
            </div>

            <button
              className="onboarding-skip-link"
              onClick={() => setShowImportModal(true)}
            >
              Or import your watch history
            </button>

            {searchingSeeds && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem 0' }}>
                <div className="onboarding-spinner-dark" />
              </div>
            )}

            {!searchingSeeds && seedResults.length > 0 && (
              <div className={`onboarding-seed-results-wrap${resultsScrolled ? ' show-top-fade' : ''}`}>
              <div className="onboarding-seed-results" ref={resultsScrollRef} onScroll={updateResultsScroll}>
                {seedResults.map(item => {
                  const isSelected = seedTitles.some(t => t.id === item.id);
                  return (
                    <button
                      key={item.id}
                      className={`onboarding-seed-result${isSelected ? ' selected' : ''}`}
                      onClick={() => toggleSeedTitle(item)}
                    >
                      {item.poster_path ? (
                        <img
                          className="onboarding-seed-poster"
                          src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                          alt={item.title || item.name}
                        />
                      ) : (
                        <div className="onboarding-seed-poster-placeholder" />
                      )}
                      <div className="onboarding-seed-info">
                        <div className="onboarding-seed-title">{item.title || item.name}</div>
                        <div className="onboarding-seed-meta">
                          {item.media_type === 'tv' ? 'TV Series' : 'Movie'}
                          {(item.release_date || item.first_air_date)
                            ? ` · ${(item.release_date || item.first_air_date).slice(0, 4)}`
                            : ''
                          }
                        </div>
                      </div>
                      <div className="onboarding-seed-check">
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                            <polyline points="1.5 6 4.5 9 10.5 3" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              </div>
            )}

          </div>
        )}
      </div>

      {showImportModal && (
        <ImportModal
          user={user}
          onClose={() => setShowImportModal(false)}
          onImported={(count) => {
            setShowImportModal(false);
          }}
        />
      )}

      {/* Navigation */}
      <div className="onboarding-nav">
        {step > 1 ? (
          <button className="onboarding-btn-back" onClick={() => setStep(s => s - 1)}>
            Back
          </button>
        ) : (
          <div />
        )}
        <button
          className="onboarding-btn-next"
          onClick={handleNext}
          disabled={!canProceed() || saving}
        >
          {saving
            ? <div className="onboarding-spinner" />
            : step === TOTAL_STEPS ? 'Done' : 'Continue'
          }
        </button>
      </div>
    </div>
  );
}
