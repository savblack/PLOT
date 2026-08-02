import '../lib/configureCore'; // MUST be first: injects Expo env into shared core before any data call
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import PlotLoader from '@plot/ui/PlotLoader';
import ErrorBoundary from '../components/ErrorBoundary';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { setTmdbRegion } from '../lib/tmdb';
import { consumeTraktState, exchangeTraktCode } from '../hooks/useTraktSync';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { AppDataProvider } from '../contexts/AppDataContext';
import { DrawerProvider, useDrawer } from '../contexts/DrawerContext';
import { MediaPanelProvider, useMediaPanel } from '../contexts/MediaPanelContext';
import DrawerMenu from '../components/DrawerMenu';
import MediaPanel from '../components/MediaPanel';
import type { Session } from '@supabase/supabase-js';

function AuthGuard({ session, onboardingComplete }: {
  session: Session | null;
  onboardingComplete: boolean | null;
}) {
  const segments = useSegments();
  const router   = useRouter();

  useEffect(() => {
    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!session) {
      // Not logged in → send to auth
      if (!inAuth) router.replace('/(auth)');
    } else if (onboardingComplete === false) {
      // Logged in but onboarding not done
      if (!inOnboarding) router.replace('/onboarding/name');
    } else if (onboardingComplete === true) {
      // Fully onboarded
      if (inAuth || inOnboarding) router.replace('/(app)');
    }
  }, [session, onboardingComplete, segments]);

  return <Slot />;
}

function RootDrawerMenu() {
  const { isOpen, close } = useDrawer();
  return <DrawerMenu visible={isOpen} onClose={close} />;
}

function RootMediaPanel() {
  const { state, close } = useMediaPanel();
  if (!state.itemId || !state.itemType) return null;
  return <MediaPanel itemId={state.itemId} itemType={state.itemType} onClose={close} />;
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
  const [authReady,          setAuthReady]          = useState(false);

  const [fontsLoaded] = useFonts({
    'InstrumentSerif-Regular': require('../assets/fonts/InstrumentSerif-Regular.ttf'),
    'InstrumentSerif-Italic':  require('../assets/fonts/InstrumentSerif-Italic.ttf'),
    'DMSans-Regular':          require('../assets/fonts/DMSans-Regular.ttf'),
    'DMSans-Medium':           require('../assets/fonts/DMSans-Medium.ttf'),
    'DMSans-SemiBold':         require('../assets/fonts/DMSans-SemiBold.ttf'),
  });

  // Load profile to check onboarding status
  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('region, onboarding_complete')
      .eq('id', userId)
      .maybeSingle();
    if (data?.region) setTmdbRegion(data.region);
    setOnboardingComplete(data?.onboarding_complete ?? false);
  };

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setOnboardingComplete(null);
      }
      setAuthReady(true);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setOnboardingComplete(null);
      }
    });

    return () => subscription.unsubscribe();
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

  // The wordmark loader needs Instrument Serif — before the fonts are in it
  // would render in the system fallback with mangled spacing. Blank until then.
  if (!fontsLoaded) return <ThemedBlank />;
  if (!authReady)   return <PlotLoader backgroundColor={colors.bg} color={colors.textPrimary} />;

  return (
    <SafeAreaProvider>
      {/* Shared user data — loads once after login; screens navigate instantly */}
      <AppDataProvider>
        <DrawerProvider>
          <MediaPanelProvider>
            <ThemedStatusBar />
            <RootDrawerMenu />
            <RootMediaPanel />
            <AuthGuard session={session} onboardingComplete={onboardingComplete} />
          </MediaPanelProvider>
        </DrawerProvider>
      </AppDataProvider>
    </SafeAreaProvider>
  );
}
