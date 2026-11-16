import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { pathAfterOnboarding, peekReturnPath, takeReturnPath } from '../utils/authReturn.js';
import { supabase } from '@plot/core/supabase.js';
import { tmdb } from '@plot/core/tmdb.js';
// This route renders outside the App-shell layout, but reuses a few of its
// classes (onboarding-cta, onboarding-back, search-input-clear). Its named
// import from App.jsx doesn't pull in App's CSS on its own, so import app.css
// explicitly; Vite dedupes it against App's stylesheet.
import '../styles/app.css';
import OnboardingScreen from './OnboardingScreen.jsx';
import { track, EVENTS } from '../lib/analytics.js';
import { ONBOARDING_FLOW } from '../copy/onboardingFlow.js';
import { detectRegion, detectTimezone, guessRegionFromTimezone } from '@plot/core/regions.js';
import { upsertProfile } from '@plot/core/profile.js';
import { reportLoadFailure, FAILED_LOADS } from '@plot/core/actionFailures.js';
import {
  ONBOARDING_PROGRESS, firstNameFromAuthUser, topRegionServices,
} from '@plot/core/onboardingSetup.js';
import { loadSeedTrending, searchSeedTitles } from '@plot/core/onboardingSeed.js';
import { IMPORT_ENTRY_POINTS } from '@plot/core/importPipeline.js';
import { useImportStart } from '../hooks/useImportStart.js';
import { finishingTouchesKey, serialiseFinishingTouches, startFinishingTouches } from '@plot/core/finishingTouches.js';
import { useWatchlist } from '../hooks/useWatchlist.js';
import { usePremium } from '../hooks/usePremium.js';
import { takePremiumCheckoutIntent } from '../utils/premiumCheckoutIntent.js';
import { SHOW_PRICING_PAGE } from '../launchFeatures.js';
import { readPendingSave } from '../utils/pendingSave.js';
import { writeOnboardingStash, takeOnboardingStash } from '../utils/onboardingStash.js';
import { notifyOnboardingCompleted } from '@plot/core/brevoLifecycleClient.js';
import { readStorage, writeStorage } from '../utils/storage.js';
import { clearPremiumTrialPrompt, requestPremiumTrialPrompt } from '@plot/core/premiumTrialPrompt.js';
import { cacheOnboardingComplete } from '../utils/sessionCache.js';
import { isPreviewDeployment } from '../utils/previewDeployment.js';
import {
  previousOnboardingComplete,
  readOnboardingUntilDecided,
  shouldTrackOnboardingCompleted,
} from '@plot/core/onboardingGate.js';

const F = ONBOARDING_FLOW;

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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
  const [step, setStep] = useState(() => (searchParams.get('import') ? 'import' : readPendingSave() ? 'services' : 'seed'));
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
  // A failed search or trending load shows a line with Retry under the search
  // field. The try counters re-run the load.
  const [seedSearchFailed, setSeedSearchFailed] = useState(false);
  const [seedSearchTry, setSeedSearchTry] = useState(0);
  const [trending, setTrending] = useState([]);
  const [trendingFailed, setTrendingFailed] = useState(false);
  const [trendingTry, setTrendingTry] = useState(0);
  // The same-tab Trakt fallback parks the picks in sessionStorage on the way
  // out (utils/onboardingStash.js); ?import=trakt is the way back in.
  const [seedSelected, setSeedSelected] = useState(() => (searchParams.get('import') ? takeOnboardingStash()?.seeds ?? [] : []));

  // Switching apps. The import itself starts here: a file is uploaded and
  // queued, or an account is connected and queued, and the import-worker
  // carries on in the background (packages/core/importJobs.js). More than one
  // source can be queued; the worker takes them one at a time. A same-tab
  // OAuth round trip comes back as ?import=<source> with the picks stashed.
  const importStart = useImportStart({
    userId: user?.id,
    entry: IMPORT_ENTRY_POINTS.ONBOARDING,
    returnPath: (id) => `/onboarding?import=${id}`,
    onBeforeRedirect: () => writeOnboardingStash({ seeds: seedSelected }),
    initialSource: searchParams.get('import') || null,
  });
  const importSource = importStart.source;
  const importJob = importStart.jobs.length > 0 ? importStart.jobs[0] : null;

  // Where do you watch
  const [services, setServices] = useState([]);
  const [servicesError, setServicesError] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);

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
    // A failed load comes back as `ok: false`, never a throw (onboardingSeed.js).
    loadSeedTrending(tmdb).then(load => {
      if (!alive) return;
      setTrending(load.items);
      setTrendingFailed(!load.ok);
    });
    return () => { alive = false; };
  }, [step, trending.length, trendingTry]);

  /* ── Search ── */
  useEffect(() => {
    if (step !== 'seed' || !seedQuery.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear transient search results when the query is empty
      setSeedResults([]);
      setSeedSearching(false);
      setSeedSearchFailed(false);
      return;
    }
    let alive = true;
    // Searching from the keystroke, not from when the request leaves, so "No
    // titles found." can't flash during the debounce.
    setSeedSearching(true);
    setSeedSearchFailed(false);
    const t = setTimeout(async () => {
      const load = await searchSeedTitles(tmdb, seedQuery.trim());
      if (!alive) return;
      setSeedResults(load.items);
      setSeedSearchFailed(!load.ok);
      setSeedSearching(false);
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [seedQuery, step, seedSearchTry]);

  /* ── The region's services ── */
  useEffect(() => {
    if (step !== 'services') return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a region change starts a fresh load
    setServicesError(false);
    tmdb.getWatchProvidersForRegion('tv', region).then(data => {
      if (!alive) return;
      if (!data?.results) {
        reportLoadFailure(FAILED_LOADS.ONBOARDING_SERVICES, null);
        setServicesError(true); setServices([]); return;
      }
      const top = topRegionServices(data.results);
      setServices(top);
      // A service that isn't offered in the new region can't stay selected.
      setSelectedServiceIds(ids => ids.filter(id => top.some(s => s.id === id)));
    }).catch(error => {
      if (alive) {
        reportLoadFailure(FAILED_LOADS.ONBOARDING_SERVICES, error);
        setServicesError(true);
      }
    });
    return () => { alive = false; };
  }, [step, region]);

  /* ── Save and finish. Runs from the services step's Continue, or from Skip. ── */
  const save = async ({ seeds, providers }) => {
    if (!user) return false;
    setSaving(true);
    setSaveError(null);
    // Read before the write. The patch always sets the flag true, so the row
    // that comes back cannot tell us whether this is the first time. The
    // welcome email and the Brevo event both listen for onboarding_completed,
    // and only this first time.
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
    // Home mounts its own auth gate after this route unmounts. Keep its first
    // decision aligned with the completion write while the profile revalidates.
    cacheOnboardingComplete(user.id);
    // Sequential, not Promise.all: addToList's duplicate check reads React
    // state that only advances between awaited turns.
    for (const item of seeds) {
      await watchlist.addToList(item, { source: 'onboarding' });
    }
    // Home's Finishing touches card starts now (once per account on this device).
    // "Mark where you're up to" reads the watchlist later, not these picks.
    const key = finishingTouchesKey(user.id);
    if (!readStorage(key)) writeStorage(key, serialiseFinishingTouches(startFinishingTouches(Date.now())));
    if (trackCompletion) {
      // After the picks are on My List, so the email sees the current watchlist.
      await notifyOnboardingCompleted();
      track(EVENTS.ONBOARDING_COMPLETED, {
        region,
        seed_titles_added: seeds.length,
        services_added: providers.length,
        import_source: importSource,
        skipped: seeds.length === 0,
      });
      // The first of the trial prompt's two moments (shown by the app shell).
      requestPremiumTrialPrompt('onboarding');
    }
    setSaving(false);
    return true;
  };

  const exitPath = async () => {
    const plan = SHOW_PRICING_PAGE ? takePremiumCheckoutIntent() : null;
    if (plan) {
      // Already on the way to Checkout: no trial prompt on top of it.
      clearPremiumTrialPrompt();
      const started = await premium.startCheckout(plan, 'premium_signup');
      return started ? null : `/pricing?billing=${plan}`;
    }
    // A link they clicked (the founding-users email, a shared page) wins.
    // Otherwise a source picked here but never started still opens import.
    const importContinuation = importSource && !importJob && importStart.phase !== 'pick'
      ? `/import?source=${importSource}&from=${IMPORT_ENTRY_POINTS.ONBOARDING}`
      : null;
    const remembered = peekReturnPath();
    const path = pathAfterOnboarding({ remembered, importContinuation });
    if (remembered) takeReturnPath('/home');
    return path;
  };

  // Skip saves nothing: titles already picked on step 1 are forgotten, on
  // purpose (decided 2026-11-16). Mobile's Skip does the same.
  const skipToHome = async () => {
    completeStep(step, { skipped: true });
    const ok = await save({ seeds: [], providers: [] });
    if (!ok) return;
    const path = await exitPath();
    if (path) navigate(path, { replace: true });
  };

  // The last step. The save runs with the services step still on screen (its
  // buttons hold while it does), and Home opens as soon as it lands. There
  // was a building screen between the two until 2026-11-16. A failed save
  // stays here and shows why.
  const finish = async ({ skipped = false } = {}) => {
    completeStep('services', { skipped });
    const providers = skipped ? [] : services.filter(s => selectedServiceIds.includes(s.id));
    const ok = await save({ seeds: seedSelected, providers });
    if (!ok) return;
    const path = await exitPath();
    if (path) navigate(path, { replace: true });
  };

  const toggleSeed = (item) => {
    setSeedSelected(prev => (prev.some(i => i.id === item.id) ? prev.filter(i => i.id !== item.id) : [...prev, item]));
  };
  const toggleService = (id) => {
    setSelectedServiceIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const goBack = () => {
    if (step === 'import') { importStart.close(); setStep('seed'); }
    else if (step === 'services') setStep(importSource ? 'import' : 'seed');
  };

  // Onboarding shows no loader anywhere: while the
  // account is checked, the page is just its background.
  if (authLoading || !user || setupGate !== 'show') {
    return <div className="app-boot-loader" aria-busy="true" />;
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
      onSkip={step === 'services' ? () => finish({ skipped: true }) : skipToHome}
      seed={{
        query: seedQuery,
        onQuery: setSeedQuery,
        searching: seedSearching,
        searchFailed: !!seedQuery.trim() && seedSearchFailed,
        onRetrySearch: () => setSeedSearchTry(n => n + 1),
        trendingFailed: !seedQuery.trim() && trendingFailed,
        onRetryTrending: () => { setTrendingFailed(false); setTrendingTry(n => n + 1); },
        items: seedQuery.trim() ? seedResults : trending,
        selectedIds: new Set(seedSelected.map(i => i.id)),
        count: n,
        onToggle: toggleSeed,
        onContinue: () => { completeStep('seed'); setStep('services'); },
        onSwitch: () => { completeStep('seed'); setStep('import'); },
      }}
      importStep={{
        start: importStart,
        onContinue: () => { completeStep('import'); importStart.close(); setStep('seed'); },
        onLater: () => { completeStep('import', { skipped: true }); setStep('services'); },
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
        onContinue: () => finish(),
      }}
    />
  );
}
