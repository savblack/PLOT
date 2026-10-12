import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { takeReturnPath } from '../utils/authReturn.js';
import { supabase } from '@plot/core/supabase.js';
import { tmdb } from '@plot/core/tmdb.js';
// This route renders outside the App-shell layout, but reuses a few of its
// classes (onboarding-cta, onboarding-back, search-input-clear). Its named
// import from App.jsx doesn't pull in App's CSS on its own, so import app.css
// explicitly; Vite dedupes it against App's stylesheet.
import '../styles/app.css';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import OnboardingScreen from './OnboardingScreen.jsx';
import { track, EVENTS } from '../lib/analytics.js';
import { ONBOARDING_FLOW } from '../copy/onboardingFlow.js';
import { detectRegion, detectTimezone, guessRegionFromTimezone } from '@plot/core/regions.js';
import { upsertProfile } from '@plot/core/profile.js';
import {
  ONBOARDING_PROGRESS, buildingFan, buildingLines, firstNameFromAuthUser, topRegionServices,
} from '@plot/core/onboardingSetup.js';
import { createImportReporter, IMPORT_ENTRY_POINTS } from '@plot/core/importPipeline.js';
import { finishingTouchesKey, serialiseFinishingTouches, startFinishingTouches } from '@plot/core/finishingTouches.js';
import { useWatchlist } from '../hooks/useWatchlist.js';
import { usePremium } from '../hooks/usePremium.js';
import { takePremiumCheckoutIntent } from '../utils/premiumCheckoutIntent.js';
import { SHOW_PRICING_PAGE } from '../launchFeatures.js';
import { readPendingSave } from '../utils/pendingSave.js';
import { readStorage, writeStorage } from '../utils/storage.js';
import { isPreviewDeployment } from '../utils/previewDeployment.js';
import {
  previousOnboardingComplete,
  readOnboardingUntilDecided,
  shouldTrackOnboardingCompleted,
} from '@plot/core/onboardingGate.js';

const F = ONBOARDING_FLOW;
// The building moment: each line holds this long, then Home fades in.
const LINE_MS = 1500;
const FADE_MS = 600;
// Step 1's grid: 8 full rows on desktop (6 across), 16 on phones (3 across).
const TRENDING_COUNT = 48;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function OnboardingFlow() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // 'pending' until a profile row says setup is unfinished. A finished account
  // that lands here (a bad redirect, a bookmark) goes home without seeing the
  // flow. Previews skip this so a branch can still open the page directly.
  const previewOnboarding = isPreviewDeployment();
  const [setupGate, setSetupGate] = useState(() => (previewOnboarding ? 'show' : 'pending'));
  const [pendingSave] = useState(readPendingSave);
  // Someone who already chose a title on the way in skips "save a few"; that
  // title opens once setup is done.
  const [step, setStep] = useState(() => (readPendingSave() ? 'services' : 'seed'));
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const premium = usePremium(null);
  const watchlist = useWatchlist(user?.id);

  const [region, setRegion] = useState(guessRegionFromTimezone);
  const [regionTouched, setRegionTouched] = useState(false);
  const [editingRegion, setEditingRegion] = useState(false);

  // Save a few
  const [seedQuery, setSeedQuery] = useState('');
  const [seedResults, setSeedResults] = useState([]);
  const [seedSearching, setSeedSearching] = useState(false);
  const [trending, setTrending] = useState([]);
  const [seedSelected, setSeedSelected] = useState([]);

  // Switching apps
  const [importSource, setImportSource] = useState(null);

  // Where do you watch
  const [services, setServices] = useState([]);
  const [servicesError, setServicesError] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);

  // Building
  const [lineIndex, setLineIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const nextPathRef = useRef(null);

  const firstName = useMemo(() => firstNameFromAuthUser(user), [user]);

  /* ── Auth ── */
  useEffect(() => {
    let alive = true;
    const syncUser = (session) => {
      if (!alive) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
    };
    supabase.auth.getSession().then(({ data: { session } }) => syncUser(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => syncUser(session));
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  /* ── Hold the flow until the profile row says setup is unfinished ── */
  useEffect(() => {
    if (!user || previewOnboarding) return undefined;
    let cancelled = false;
    readOnboardingUntilDecided(
      () => supabase.from('profiles')
        .select('onboarding_complete')
        .eq('id', user.id)
        .maybeSingle(),
      { shouldStop: () => cancelled },
    ).then((read) => {
      if (cancelled || !read.decided) return;
      if (read.onboardingComplete) {
        navigate(takeReturnPath('/home'), { replace: true });
        return;
      }
      setSetupGate('show');
    });
    return () => { cancelled = true; };
  }, [user, previewOnboarding, navigate]);

  /* ── Activation funnel: fire once the flow is actually shown ── */
  const startedRef = useRef(false);
  useEffect(() => {
    if (user && setupGate === 'show' && !startedRef.current) {
      startedRef.current = true;
      track(EVENTS.ONBOARDING_STARTED);
    }
  }, [user, setupGate]);

  const completeStep = (name, { skipped = false } = {}) => {
    track(EVENTS.ONBOARDING_STEP_COMPLETED, { step: ONBOARDING_PROGRESS[name], step_name: name, skipped });
  };

  /* ── Region: timezone guess, refined by IP, unless they picked one ── */
  useEffect(() => {
    let alive = true;
    detectRegion({ endpoint: '/api/region' }).then(detected => {
      if (alive && !regionTouched) setRegion(detected);
    });
    return () => { alive = false; };
  }, [regionTouched]);

  /* ── This week's trending, for the grid ── */
  useEffect(() => {
    if (step !== 'seed' || trending.length > 0) return;
    let alive = true;
    tmdb.getTrending('all', 'week').then(data => {
      if (!alive) return;
      // getTrending already fetches three pages (up to 60); a title can land on
      // two of them, so keep the first of each.
      const seen = new Set();
      setTrending((data?.results || [])
        .filter(r => (r.media_type === 'tv' || r.media_type === 'movie') && r.poster_path)
        .filter(r => { const k = `${r.media_type}-${r.id}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .slice(0, TRENDING_COUNT));
    });
    return () => { alive = false; };
  }, [step, trending.length]);

  /* ── Search ── */
  useEffect(() => {
    if (step !== 'seed' || !seedQuery.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear transient search results when the query is empty
      setSeedResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSeedSearching(true);
      const data = await tmdb.search(seedQuery);
      setSeedResults((data?.results || [])
        .filter(r => (r.media_type === 'tv' || r.media_type === 'movie') && r.poster_path)
        .slice(0, 24));
      setSeedSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [seedQuery, step]);

  /* ── The region's services ── */
  useEffect(() => {
    if (step !== 'services') return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a region change starts a fresh load
    setServicesError(false);
    tmdb.getWatchProvidersForRegion('tv', region).then(data => {
      if (!alive) return;
      if (!data?.results) { setServicesError(true); setServices([]); return; }
      const top = topRegionServices(data.results);
      setServices(top);
      // A service that isn't offered in the new region can't stay selected.
      setSelectedServiceIds(ids => ids.filter(id => top.some(s => s.id === id)));
    }).catch(() => { if (alive) setServicesError(true); });
    return () => { alive = false; };
  }, [step, region]);

  /* ── Save and finish. Runs behind the building moment, or straight away on Skip. ── */
  const save = async ({ seeds, providers }) => {
    if (!user) return false;
    setSaving(true);
    setSaveError(null);
    // Read before the write. The patch always sets the flag true, so the row
    // that comes back cannot tell us whether this is the first time. The
    // welcome email listens for onboarding_completed.
    const prior = await supabase.from('profiles')
      .select('onboarding_complete')
      .eq('id', user.id)
      .maybeSingle();
    const trackCompletion = shouldTrackOnboardingCompleted(previousOnboardingComplete(prior));
    const patch = {
      region,
      timezone: detectTimezone(),
      onboarding_complete: true,
      // Only when they picked some: an empty pick means "every platform",
      // which is what no saved services already means.
      ...(providers.length ? { streaming_providers: providers } : {}),
      // Never overwrite a name with nothing.
      ...(firstName ? { first_name: firstName } : {}),
    };
    const { error } = await upsertProfile({ userId: user.id, patch });
    if (error) {
      // Don't leave for /home on a failed write: ProtectedRoute would bounce
      // straight back here because onboarding_complete never got set.
      setSaving(false);
      setSaveError(F.saveError);
      return false;
    }
    // Sequential, not Promise.all: addToList's duplicate check reads React
    // state that only advances between awaited turns.
    for (const item of seeds) {
      await watchlist.addToList(item, { source: 'onboarding' });
    }
    // Home's Finishing touches card starts now (once per account on this device).
    const key = finishingTouchesKey(user.id);
    if (!readStorage(key)) writeStorage(key, serialiseFinishingTouches(startFinishingTouches()));
    if (trackCompletion) {
      track(EVENTS.ONBOARDING_COMPLETED, {
        region,
        seed_titles_added: seeds.length,
        services_added: providers.length,
        import_source: importSource,
        skipped: seeds.length === 0,
      });
    }
    setSaving(false);
    return true;
  };

  const exitPath = async () => {
    const plan = SHOW_PRICING_PAGE ? takePremiumCheckoutIntent() : null;
    if (plan) {
      const started = await premium.startCheckout(plan, 'premium_signup');
      return started ? null : `/pricing?billing=${plan}`;
    }
    // Switching apps: the import itself needs the page, so it opens once
    // setup is done rather than pretending to run during it.
    if (importSource) return `/import?source=${importSource}&from=${IMPORT_ENTRY_POINTS.ONBOARDING}`;
    return takeReturnPath('/home');
  };

  const skipToHome = async () => {
    completeStep(step, { skipped: true });
    const ok = await save({ seeds: [], providers: [] });
    if (!ok) return;
    const path = await exitPath();
    if (path) navigate(path, { replace: true });
  };

  const startBuilding = ({ skipped = false } = {}) => {
    completeStep('services', { skipped });
    const providers = skipped ? [] : services.filter(s => selectedServiceIds.includes(s.id));
    setLineIndex(0);
    setLeaving(false);
    setStep('building');
    const wait = new Promise(resolve => setTimeout(resolve, LINE_MS * buildingLines(true).length));
    Promise.all([save({ seeds: seedSelected, providers }), wait]).then(async ([ok]) => {
      if (!ok) { setStep('services'); return; }
      completeStep('building');
      nextPathRef.current = await exitPath();
      if (!nextPathRef.current) return;
      setLeaving(true);
      setTimeout(() => navigate(nextPathRef.current, { replace: true }), prefersReducedMotion() ? 0 : FADE_MS);
    });
  };

  /* ── Rotate the building lines ── */
  useEffect(() => {
    if (step !== 'building') return;
    const id = setInterval(() => setLineIndex(i => Math.min(i + 1, buildingLines(true).length - 1)), LINE_MS);
    return () => clearInterval(id);
  }, [step]);

  const toggleSeed = (item) => {
    setSeedSelected(prev => (prev.some(i => i.id === item.id) ? prev.filter(i => i.id !== item.id) : [...prev, item]));
  };
  const toggleService = (id) => {
    setSelectedServiceIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const goBack = () => {
    if (step === 'import') setStep('seed');
    else if (step === 'services') setStep(importSource ? 'import' : 'seed');
  };

  if (authLoading || !user || setupGate !== 'show') {
    return <div className="app-boot-loader"><PlotLoader /></div>;
  }

  const n = seedSelected.length;

  return (
    <OnboardingScreen
      step={step}
      firstName={firstName}
      saving={saving}
      saveError={saveError}
      canGoBack={step === 'import' || (step === 'services' && !pendingSave)}
      onBack={goBack}
      onSkip={step === 'services' ? () => startBuilding({ skipped: true }) : skipToHome}
      seed={{
        query: seedQuery,
        onQuery: setSeedQuery,
        searching: seedSearching,
        items: seedQuery.trim() ? seedResults : trending,
        selectedIds: new Set(seedSelected.map(i => i.id)),
        count: n,
        onToggle: toggleSeed,
        onContinue: () => { completeStep('seed'); setStep('services'); },
        onSwitch: () => { completeStep('seed'); setStep('import'); },
      }}
      onPickImport={(id) => {
        createImportReporter({ entry: IMPORT_ENTRY_POINTS.ONBOARDING }).selected(id);
        setImportSource(id);
        setStep('services');
      }}
      services={{
        list: servicesError ? [] : (services.length ? services : null),
        error: servicesError,
        selectedIds: selectedServiceIds,
        onToggle: toggleService,
        region,
        editingRegion,
        onEditRegion: () => setEditingRegion(true),
        onRegion: (code) => { setRegion(code); setRegionTouched(true); setEditingRegion(false); },
        onRegionDone: () => setEditingRegion(false),
        onContinue: () => startBuilding(),
      }}
      building={{
        leaving,
        fan: buildingFan(seedSelected, trending),
        lines: buildingLines(selectedServiceIds.length > 0),
        lineIndex,
      }}
    />
  );
}
