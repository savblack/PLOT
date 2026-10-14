import '../lib/configureCore'; // MUST be first: injects Expo env into shared core before any data call
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Slot, usePathname, useRouter, useSegments, type Href } from 'expo-router';
import { consumeCompareHandoff, rememberCompareReturn, resetCompareHandoff } from '../lib/authReturn';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import PlotLoader from '@plot/ui/PlotLoader';
import ErrorBoundary from '../components/ErrorBoundary';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { setTmdbRegion } from '../lib/tmdb';
import { setUserTimezone } from '@plot/core/date.js';
import { personPropsFromProfile } from '@plot/core/analyticsEvents.js';
import { touchLastSeen } from '@plot/core/brevoLifecycleClient.js';
import { onboardingGuardDecision, readOnboardingUntilDecided } from '@plot/core/onboardingGate.js';
import { initAnalytics, identifyUser, resetAnalytics, setPersonProps } from '../lib/analytics';
import { hydrateSectionOpenState } from '../lib/sectionOpenState';
import { consumeTraktState, exchangeTraktCode } from '../hooks/useTraktSync';
import { consumeSimklState, exchangeSimklCode } from '../hooks/useSimklSync';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { AppDataProvider, useAppData } from '../contexts/AppDataContext';
import { OnboardingCompleteContext, OnboardingRefreshContext } from '../contexts/OnboardingContext';
import { DrawerProvider, useDrawer } from '../contexts/DrawerContext';
import { MediaPanelProvider, useMediaPanel } from '../contexts/MediaPanelContext';
import DrawerMenu from '../components/DrawerMenu';
import MediaPanel from '../components/MediaPanel';
import CollectionPanel from '../components/CollectionPanel';
import type { Session } from '@supabase/supabase-js';
import UndoToast from '../components/UndoToast';
import RateToast from '../components/RateToast';
import useRateReminders from '../hooks/useRateReminders';
import NoticeToast from '../components/NoticeToast';
import { EpisodeAlertsPromptController, EpisodeAlertsPromptToast } from '../components/EpisodeAlertsPrompt';
import { FollowToastHost } from '../components/people/FollowControls';
import PushHost from '../components/PushHost';
import {
  clearWatchTogetherReturn,
  consumeWatchTogetherReturn,
  rememberWatchTogetherReturn,
  resetWatchTogetherHandoff,
  watchTogetherHandedOff,
} from '../lib/watchTogetherReturn';

function AuthGuard({ session, onboardingComplete }: {
  session: Session | null;
  onboardingComplete: boolean | null;
}) {
  const segments = useSegments();
  const pathname = usePathname();
  const router   = useRouter();
  const { colors } = useTheme();
  const inAuth = segments[0] === '(auth)';
  const inOnboarding = segments[0] === 'onboarding';
  const onInviteLink = segments[0] === 'watch-with' || segments[0] === 'join-list';
  // null onboardingComplete means the profile row has not loaded. That is
  // 'loading', not a new account. The root layout also holds the loader then.
  const decision = onboardingGuardDecision({
    authDecided: true,
    authenticated: !!session,
    profileDecided: onboardingComplete !== null,
    onboardingComplete: onboardingComplete === true,
  });

  useEffect(() => {
    if (decision === 'loading') return;

    if (decision === 'login') {
      resetCompareHandoff();
      // A signed-out visitor can read an invite link. Remember it so sign-in
      // brings them back. A compare link is restored the same way. Anywhere
      // else still goes to auth.
      if (onInviteLink) {
        rememberWatchTogetherReturn(pathname);
        resetWatchTogetherHandoff();
      } else {
        resetWatchTogetherHandoff();
        if (!inAuth) {
          rememberCompareReturn(pathname);
          router.replace('/(auth)');
        }
      }
      return;
    }

    if (decision === 'onboarding') {
      if (!inOnboarding) router.replace('/onboarding/seed');
      return;
    }

    if (onInviteLink) {
      clearWatchTogetherReturn();
      resetCompareHandoff();
    } else if (inAuth || inOnboarding) {
      const back = consumeWatchTogetherReturn();
      if (back) router.replace(back as Href);
      else if (!watchTogetherHandedOff()) {
        const handoff = consumeCompareHandoff();
        if (handoff.go) router.replace((handoff.path ?? '/(app)') as Href);
      }
    } else {
      resetCompareHandoff();
    }
  }, [decision, inAuth, inOnboarding, onInviteLink, pathname, router]);

  // Cover the screen we are about to leave so a finished account never sees
  // the setup flow, even for a frame, while the replace runs.
  const cover =
    (decision === 'login' && !inAuth && !onInviteLink) ||
    (decision === 'onboarding' && !inOnboarding) ||
    (decision === 'app' && (inAuth || inOnboarding));

  return (
    <View style={{ flex: 1 }}>
      <Slot />
      {cover ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <PlotLoader backgroundColor={colors.bg} color={colors.textPrimary} />
        </View>
      ) : null}
    </View>
  );
}

function RateReminders() {
  useRateReminders();
  return null;
}

function RootDrawerMenu() {
  const { isOpen, close } = useDrawer();
  return <DrawerMenu visible={isOpen} onClose={close} />;
}

function RootMediaPanel() {
  const { state, close } = useMediaPanel();
  if (!state.itemId || !state.itemType) return null;
  if (state.itemType === 'collection') return <CollectionPanel collectionId={state.itemId} onClose={close} />;
  return <MediaPanel itemId={state.itemId} itemType={state.itemType} onClose={close} />;
}

function ThemeEntitlement({ signedIn }: { signedIn: boolean }) {
  const { profile } = useAppData();
  const { setEntitlement } = useTheme();
  const known = profile != null;
  const premium = profile?.is_premium === true;
  useEffect(() => {
    // Unknown while the signed-in profile is still loading, including a failed
    // read. effectiveFamily keeps a stored Premium family, and nothing here
    // writes the preference back.
    if (!signedIn) setEntitlement(false);
    else setEntitlement(known ? premium : null);
  }, [signedIn, known, premium, setEntitlement]);
  return null;
}

function ThemedStatusBar() {
  const { resolved } = useTheme();
  return <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />;
}

// Pre-font placeholder: just the themed background, no wordmark.
function ThemedBlank() {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}

type BootProfile = {
  region: string | null;
  timezone: string | null;
  onboarding_complete: boolean | null;
  is_premium: boolean | null;
  is_supporter: boolean | null;
  last_kofi_tip_at: string | null;
};

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <RootInner />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function RootInner() {
  const { colors } = useTheme();
  const [session,            setSession]            = useState<Session | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [profileReady,       setProfileReady]       = useState(false);
  const [authReady,          setAuthReady]          = useState(false);
  const activeUserIdRef = useRef<string | null>(null);
  const profileGen = useRef(0);
  const profileReadyRef = useRef(false);

  const [fontsLoaded] = useFonts({
    // Display face: Gabarito static cuts (RN cannot pick a weight axis from a variable font).
    'Gabarito-Bold':           require('../assets/fonts/Gabarito-Bold.ttf'),
    'Gabarito-SemiBold':       require('../assets/fonts/Gabarito-SemiBold.ttf'),
    'DMSans-Regular':          require('../assets/fonts/DMSans-Regular.ttf'),
    'DMSans-Medium':           require('../assets/fonts/DMSans-Medium.ttf'),
    'DMSans-SemiBold':         require('../assets/fonts/DMSans-SemiBold.ttf'),
    // Tabular-digit cuts — see lib/tokens.ts and apps/web/public/fonts/README.md.
    'DMSans-TabularRegular':   require('../assets/fonts/DMSans-TabularRegular.ttf'),
    'DMSans-TabularSemiBold':  require('../assets/fonts/DMSans-TabularSemiBold.ttf'),
  });

  // Load profile to check onboarding status. An empty read is not "new
  // account": the request right after sign-in can go out before the access
  // token is attached, and RLS then returns no row. Keep loading until a row
  // arrives. `revalidate` is a token refresh for an account we already decided.
  const loadProfile = useCallback(async (userId: string, gen: number, mode: 'block' | 'refresh' | 'revalidate') => {
    const result = await readOnboardingUntilDecided(
      async () => {
        const res = await supabase
          .from('profiles')
          .select('region, timezone, onboarding_complete, is_premium, is_supporter, last_kofi_tip_at')
          .eq('id', userId)
          .maybeSingle();
        return {
          data: res.data as BootProfile | null,
          error: res.error,
        };
      },
      {
        shouldStop: () => profileGen.current !== gen || activeUserIdRef.current !== userId,
        maxAttempts: mode === 'revalidate' ? 1 : Number.POSITIVE_INFINITY,
      },
    );
    if (profileGen.current !== gen || activeUserIdRef.current !== userId || !result.decided) return;
    const data = result.data;
    if (data?.region) setTmdbRegion(data.region);
    // Set alongside the region at boot, before any screen renders a date —
    // AppDataProvider applies it again on its own profile load.
    setUserTimezone(data?.timezone || null);
    setOnboardingComplete(result.onboardingComplete);
    // Keep all badges on the PostHog person so any event can be segmented by
    // them — paying and tipping are different behaviours worth telling apart.
    if (data) {
      setPersonProps(personPropsFromProfile({
        is_premium: data.is_premium === true,
        is_supporter: data.is_supporter === true,
        last_kofi_tip_at: data.last_kofi_tip_at,
      }));
    }
    profileReadyRef.current = true;
    setProfileReady(true);
  }, []);

  // Re-read the profile on demand. The seed screen awaits this after it writes
  // onboarding_complete, so AuthGuard below never routes off the stale value.
  const refreshOnboarding = useCallback(async () => {
    const userId = activeUserIdRef.current;
    if (!userId) return;
    const gen = ++profileGen.current;
    await loadProfile(userId, gen, 'refresh');
  }, [loadProfile]);

  useEffect(() => {
    // Before the first session check, so nothing captured during boot is lost —
    // calls made before the SDK is ready queue inside lib/analytics.
    initAnalytics();

    // Read every persisted section open/closed state into memory before any
    // list screen mounts. CollapsibleSection seeds from that cache
    // synchronously; without this a collapsed section flashes open first.
    hydrateSectionOpenState();

    let cancelled = false;

    // Session state updates here. The profile read is deferred so it does not
    // run inside onAuthStateChange, where the new access token may not be on
    // the client yet.
    const begin = (next: Session | null) => {
      if (cancelled) return;
      const nextId = next?.user?.id ?? null;
      const prevId = activeUserIdRef.current;
      activeUserIdRef.current = nextId;
      setSession(next);
      if (!nextId) {
        resetAnalytics();
        setOnboardingComplete(null);
        profileReadyRef.current = false;
        setProfileReady(false);
        profileGen.current += 1;
        return;
      }
      identifyUser(nextId);
      const mode = nextId !== prevId || !profileReadyRef.current ? 'block' : 'revalidate';
      if (mode === 'block') {
        setOnboardingComplete(null);
        profileReadyRef.current = false;
        setProfileReady(false);
      }
      const gen = ++profileGen.current;
      setTimeout(() => {
        if (!cancelled) loadProfile(nextId, gen, mode);
      }, 0);
    };

    // Initial session check
    supabase.auth.getSession().then(({ data: { session: next } }) => {
      begin(next);
      if (!cancelled) setAuthReady(true);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      begin(next);
    });

    return () => {
      cancelled = true;
      activeUserIdRef.current = null;
      profileGen.current += 1;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Once a day. The RPC no-ops after the first call of the UTC day.
  useEffect(() => {
    if (!session?.user?.id) return;
    void touchLastSeen();
  }, [session?.user?.id]);

  useEffect(() => {
    const handle = async (url: string | null) => {
      if (!url || !/simkl/.test(url)) return;
      const parsed = Linking.parse(url);
      const code = parsed.queryParams?.code as string | undefined;
      const state = parsed.queryParams?.state as string | undefined;
      if (!code || !await consumeSimklState(state)) return;
      try { await exchangeSimklCode(code); } catch (e) { console.warn('[simkl] code exchange failed', e); }
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);

  // Trakt OAuth redirect (plot://auth/trakt?code=…) — routing-agnostic: catch
  // any incoming deep link carrying a Trakt code and exchange it for tokens.
  useEffect(() => {
    const handle = async (url: string | null) => {
      if (!url || !/trakt/.test(url)) return;
      const code = Linking.parse(url).queryParams?.code as string | undefined;
      const state = Linking.parse(url).queryParams?.state as string | undefined;
      if (!code) return;
      if (!await consumeTraktState(state)) return;
      try { await exchangeTraktCode(code); } catch (e) { console.warn('[trakt] code exchange failed', e); }
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);

  // The wordmark loader needs Gabarito — before the fonts are in it
  // would render in the system fallback with mangled spacing. Blank until then.
  if (!fontsLoaded) return <ThemedBlank />;
  // Signed in but the profile row has not loaded: deciding now would treat
  // them as new. Signed out skips this and goes to the auth screen.
  if (!authReady || (session && !profileReady)) {
    return <PlotLoader backgroundColor={colors.bg} color={colors.textPrimary} />;
  }

  return (
    <SafeAreaProvider>
      {/* Shared user data — loads once after login; screens navigate instantly */}
      <AppDataProvider key={session?.user.id ?? 'signed-out'}>
        <ThemeEntitlement signedIn={!!session?.user} />
        <DrawerProvider>
          <MediaPanelProvider>
            <PushHost signedIn={!!session?.user} onboardingComplete={onboardingComplete} />
            <ThemedStatusBar />
            <RootDrawerMenu />
            <RootMediaPanel />
            <OnboardingCompleteContext.Provider value={onboardingComplete}>
              <OnboardingRefreshContext.Provider value={refreshOnboarding}>
                <AuthGuard session={session} onboardingComplete={onboardingComplete} />
              </OnboardingRefreshContext.Provider>
            </OnboardingCompleteContext.Provider>
            {/* After the navigator so it draws on top. The panel has its own. */}
            <UndoToast />
            <RateToast />
            <RateReminders />
            <NoticeToast />
            <EpisodeAlertsPromptController />
            <EpisodeAlertsPromptToast />
            <FollowToastHost />
          </MediaPanelProvider>
        </DrawerProvider>
      </AppDataProvider>
    </SafeAreaProvider>
  );
}
