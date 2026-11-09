/**
 * State shared by the onboarding screens: the mobile counterpart of the state
 * apps/web/src/pages/OnboardingFlow.jsx keeps in one component. Mobile splits
 * the flow across expo-router screens (seed → services → building), so
 * the picks, the region and the one save at the end live here.
 *
 * The save runs behind the building moment. It flips onboarding_complete first
 * and refreshes the root layout's cached copy before anyone navigates, for the
 * reason written up in contexts/OnboardingContext.tsx.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { ONBOARDING_PROGRESS, firstNameFromAuthUser, type OnboardingStep } from '@plot/core/onboardingSetup.js';
import { detectRegion, detectTimezone, guessRegionFromTimezone } from '@plot/core/regions.js';
import { upsertProfile } from '@plot/core/profile.js';
import { supabase } from '../lib/supabase';
import { setTmdbRegion } from '../lib/tmdb';
import { track, EVENTS } from '../lib/analytics';
import { startFinishingTouchesFor } from '../lib/finishingTouches';
import { armFirstWinCard } from '../lib/firstWinCard';
import { setPendingImportSource } from '../lib/pendingImport';
import { notifyOnboardingCompleted } from '@plot/core/brevoLifecycleClient.js';
import { useAppData } from './AppDataContext';
import { useOnboardingRefresh } from './OnboardingContext';
import { previousOnboardingComplete, shouldTrackOnboardingCompleted } from '@plot/core/onboardingGate.js';

// Web detects region against its own /api/region Pages Function; mobile has no
// origin of its own, so it hits the deployed one.
const REGION_API = 'https://app.theplot.tv/api/region';

export interface PickedTitle {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  media_type?: string;
  release_date?: string | null;
  first_air_date?: string | null;
}

export interface PickedService { id: number; name: string; logo_path: string | null }

interface OnboardingFlow {
  firstName: string;
  seeds: PickedTitle[];
  toggleSeed: (item: PickedTitle) => void;
  importSource: string | null;
  setImportSource: (id: string | null) => void;
  /** The background import queued from step 1's import lanes, if any. Home shows it. */
  importJob: { id: string } | null;
  setImportJob: (job: { id: string } | null) => void;
  region: string;
  setRegion: (code: string) => void;
  selectedServiceIds: number[];
  toggleService: (id: number) => void;
  /** The region's services as the services step loaded them. */
  services: PickedService[];
  setServices: (list: PickedService[]) => void;
  /** This week's trending titles, kept for the building moment's poster fan. */
  trending: PickedTitle[];
  setTrending: (list: PickedTitle[]) => void;
  /** Reports a finished step to the funnel. */
  completeStep: (name: OnboardingStep, opts?: { skipped?: boolean }) => void;
  /** Saves everything and leaves onboarding. Resolves false (with `saveError` set) when the write failed. */
  save: (opts?: { skipSeeds?: boolean; skipServices?: boolean }) => Promise<boolean>;
  saving: boolean;
  saveError: string | null;
}

const Ctx = createContext<OnboardingFlow | null>(null);

export function useOnboardingFlow(): OnboardingFlow {
  const value = useContext(Ctx);
  if (!value) throw new Error('useOnboardingFlow must be used inside OnboardingFlowProvider');
  return value;
}

export function OnboardingFlowProvider({ children }: { children: ReactNode }) {
  const { watchlist } = useAppData();
  const refreshOnboarding = useOnboardingRefresh();

  const [firstName, setFirstName] = useState('');
  const [seeds, setSeeds] = useState<PickedTitle[]>([]);
  const [importSource, setImportSource] = useState<string | null>(null);
  const [importJob, setImportJob] = useState<{ id: string } | null>(null);
  const [region, setRegionState] = useState(guessRegionFromTimezone);
  const regionTouched = useRef(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [services, setServicesState] = useState<PickedService[]>([]);
  const [trending, setTrending] = useState<PickedTitle[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The name comes from the sign-in provider; there is no form for it.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: { user: unknown } | null } }) => {
      setFirstName(firstNameFromAuthUser(session?.user as never));
    });
  }, []);

  // Timezone guess, refined by IP unless they picked one. Also sets the TMDB
  // region for this session, which the services step and Home both read.
  useEffect(() => {
    let alive = true;
    detectRegion({ endpoint: REGION_API }).then((detected: string) => {
      if (alive && !regionTouched.current) { setRegionState(detected); setTmdbRegion(detected); }
    });
    return () => { alive = false; };
  }, []);

  const setRegion = useCallback((code: string) => {
    regionTouched.current = true;
    setRegionState(code);
    setTmdbRegion(code);
  }, []);

  const toggleSeed = useCallback((item: PickedTitle) => {
    setSeeds(prev => (prev.some(i => i.id === item.id) ? prev.filter(i => i.id !== item.id) : [...prev, item]));
  }, []);
  const toggleService = useCallback((id: number) => {
    setSelectedServiceIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }, []);
  // A service that isn't offered in a newly picked region can't stay selected.
  const setServices = useCallback((list: PickedService[]) => {
    setServicesState(list);
    setSelectedServiceIds(ids => ids.filter(id => list.some(s => s.id === id)));
  }, []);

  const completeStep = useCallback((name: OnboardingStep, { skipped = false } = {}) => {
    track(EVENTS.ONBOARDING_STEP_COMPLETED, { step: ONBOARDING_PROGRESS[name], step_name: name, skipped });
  }, []);

  const save = useCallback(async ({ skipSeeds = false, skipServices = false }: {
    skipSeeds?: boolean; skipServices?: boolean;
  } = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
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
    const chosen = skipSeeds ? [] : seeds;
    const providers = skipServices ? [] : services.filter(s => selectedServiceIds.includes(s.id));
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
      // Don't leave for Home on a failed write: the auth guard would bounce
      // straight back here because onboarding_complete never got set.
      console.warn('[onboarding] completing onboarding failed', error);
      setSaving(false);
      setSaveError(ONBOARDING_FLOW.saveError);
      return false;
    }
    // Sequential, not Promise.all: addToList's duplicate check reads state
    // closed over at call time, which only advances between awaited turns.
    for (const item of chosen) {
      await watchlist.addToList(item, { source: 'onboarding' });
    }
    // Home's Finishing touches card starts now (once per account on this device).
    await startFinishingTouchesFor(user.id);
    // The first-win card sits on Home. A skip (nothing saved) does not arm it.
    await armFirstWinCard(user.id, { skipped: chosen.length === 0 });
    // Switching apps: a queued import runs in the background and Home shows
    // it. A source picked but never started still opens the import on Home.
    setPendingImportSource(importJob ? null : importSource);
    if (trackCompletion) {
      // After the picks are on My List, so the email sees the current watchlist.
      await notifyOnboardingCompleted();
      track(EVENTS.ONBOARDING_COMPLETED, {
        region,
        seed_titles_added: chosen.length,
        services_added: providers.length,
        import_source: importSource,
        skipped: chosen.length === 0,
      });
    }
    setSaving(false);
    // Await before anyone navigates: the root layout caches onboarding_complete
    // and only re-reads it on session changes (see contexts/OnboardingContext.tsx).
    await refreshOnboarding();
    return true;
  }, [seeds, services, selectedServiceIds, region, firstName, watchlist, importSource, importJob, refreshOnboarding]);

  // Handed to the screens as a stable object so a re-render of the provider
  // doesn't remount a screen's effects.
  const value = useMemo<OnboardingFlow>(() => ({
    firstName, seeds, toggleSeed, importSource, setImportSource, importJob, setImportJob, region, setRegion,
    selectedServiceIds, toggleService, services, setServices, trending, setTrending, completeStep, save, saving, saveError,
  }), [firstName, seeds, toggleSeed, importSource, importJob, region, setRegion, selectedServiceIds, toggleService, services, setServices, trending, completeStep, save, saving, saveError]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
