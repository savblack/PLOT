import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { TIMEZONE_TO_REGION } from '../constants';
import PlotLoader from '../components/PlotLoader';
import StepUsername from './onboarding/StepUsername';
import StepGenres from './onboarding/StepGenres';
import StepRegion from './onboarding/StepRegion';
import StepProviders from './onboarding/StepProviders';
import StepSeedTitles from './onboarding/StepSeedTitles';
import './OnboardingFlow.css';
import { usePostHog } from '@posthog/react';

const TOTAL_STEPS = 5;

const timezoneToRegion = (tz) => {
  if (tz.startsWith('Australia/')) return 'AU';
  return TIMEZONE_TO_REGION[tz] ?? null;
};

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const posthog = usePostHog();
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

  // Step 4 — Streaming Providers (selected values only; display state lives in StepProviders)
  const [selectedProviders, setSelectedProviders] = useState([]);

  // Step 5 — Seed titles (selected values only; search/scroll state lives in StepSeedTitles)
  const [seedTitles, setSeedTitles] = useState([]);

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

    posthog?.capture('onboarding_completed', {
      genres_count: selectedGenres.length,
      providers_count: selectedProviders.length,
      seed_titles_count: seedTitles.length,
      region: selectedRegion,
    });

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
        {step === 1 && (
          <StepUsername
            username={username}
            setUsername={setUsername}
            usernameChecking={usernameChecking}
            usernameError={usernameError}
            onSkip={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepGenres
            selectedGenres={selectedGenres}
            onToggleGenre={toggleGenre}
          />
        )}
        {step === 3 && (
          <StepRegion
            selectedRegion={selectedRegion}
            setSelectedRegion={setSelectedRegion}
          />
        )}
        {step === 4 && (
          <StepProviders
            selectedRegion={selectedRegion}
            selectedProviders={selectedProviders}
            onToggleProvider={toggleProvider}
          />
        )}
        {step === 5 && (
          <StepSeedTitles
            seedTitles={seedTitles}
            onToggleSeedTitle={toggleSeedTitle}
            user={user}
          />
        )}
      </div>

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
