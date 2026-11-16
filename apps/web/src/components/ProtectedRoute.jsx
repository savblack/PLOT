import { useState, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import {
  cachedProfileSkipsOnboardingGate,
  ONBOARDING_GATE_UNDECIDED,
  onboardingGateOnSession,
  onboardingGuardDecision,
  readOnboardingUntilDecided,
} from '@plot/core/onboardingGate.js';
import LoginRedirect, { OnboardingRedirect } from './LoginRedirect.jsx';
import { isPreviewDeployment } from '../utils/previewDeployment.js';
import { readCachedSession, clearCachedSession } from '../utils/sessionCache.js';
import { loadSupabase } from '../utils/loadSupabase.js';

/**
 * The app shell and /onboarding both render this guard at the same place in
 * the route tree, so React would keep one instance across the two and carry
 * its answer along. The answer for one is wrong for the other: /onboarding
 * skips the setup check, and "not finished" stops being true when setup is
 * saved. Keying on the mode gives each its own instance, which starts from
 * what this device has recorded (see cacheOnboardingComplete).
 */
export default function ProtectedRoute({ skipOnboardingCheck = false, ...props }) {
  const skip = skipOnboardingCheck || isPreviewDeployment();
  return <Gate key={skip ? 'skip-setup-check' : 'setup-check'} skip={skip} {...props} />;
}

/** What a fresh guard can take from the profile cached on this device. */
function initialGate(skip) {
  const cached = readCachedSession();
  if (skip || !cachedProfileSkipsOnboardingGate(cached?.profile)) return ONBOARDING_GATE_UNDECIDED;
  return { profileDecided: true, onboardingComplete: true, decidedUserId: cached?.userId ?? null };
}

function Gate({ children, skip, publicPrefixes = [], quiet = false }) {
  const location = useLocation();
  // This gate sits above App.jsx, so its own loading state blocks App from
  // ever mounting. A cached profile that is already finished may render the
  // app while the live row is re-read. Anything short of that stays on the
  // loader: a missing or stale "not finished" cache used to redirect before
  // the profile request returned, and the onboarding route does not re-check.
  const [authReady, setAuthReady] = useState(() => !!readCachedSession());
  const [authenticated, setAuthenticated] = useState(() => !!readCachedSession());
  const [gate, setGate] = useState(() => initialGate(skip));
  // The session handler below outlives renders, so it reads the gate here.
  const gateRef = useRef(gate);

  useEffect(() => {
    let subscription;
    let cancelled = false;
    let generation = 0;

    const commit = (next) => {
      gateRef.current = next;
      setGate(next);
    };

    const apply = async (supabase, session) => {
      const gen = ++generation;
      const stop = () => cancelled || gen !== generation;

      if (!session) {
        commit(ONBOARDING_GATE_UNDECIDED);
        setAuthenticated(false);
        setAuthReady(true);
        clearCachedSession();
        return;
      }

      setAuthenticated(true);
      setAuthReady(true);
      if (skip) return;

      const userId = session.user.id;
      const cached = readCachedSession();
      const { memory, maxAttempts } = onboardingGateOnSession(gateRef.current, {
        userId,
        cachedComplete: cached?.userId === userId && cachedProfileSkipsOnboardingGate(cached.profile),
      });
      if (memory !== gateRef.current) commit(memory);

      const read = await readOnboardingUntilDecided(
        () => supabase
          .from('profiles')
          .select('onboarding_complete')
          .eq('id', userId)
          .maybeSingle(),
        { shouldStop: stop, maxAttempts },
      );
      if (stop() || !read.decided) return;
      commit({ profileDecided: true, onboardingComplete: read.onboardingComplete, decidedUserId: userId });
    };

    loadSupabase().then(async (supabase) => {
      if (cancelled) return;
      const { data: { session } } = await supabase.auth.getSession();
      await apply(supabase, session);
      if (cancelled) return;

      // The profile read stays outside this callback. A query awaited inside
      // it can run before the new access token is on the client, and the
      // empty result looks exactly like a new account.
      ({ data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setTimeout(() => {
          if (!cancelled) apply(supabase, nextSession);
        }, 0);
      }));
    });

    return () => {
      cancelled = true;
      generation += 1;
      subscription?.unsubscribe();
    };
  }, [skip]);

  const decision = onboardingGuardDecision({
    authDecided: authReady,
    authenticated,
    profileDecided: gate.profileDecided,
    onboardingComplete: gate.onboardingComplete,
    skipOnboardingCheck: skip,
  });

  if (decision === 'loading') {
    // `quiet` routes (onboarding) show only the background while auth resolves.
    if (quiet) return <div className="app-boot-loader" aria-busy="true" />;
    return (
      <div className="app-boot-loader">
        <PlotLoader />
      </div>
    );
  }

  // Some routes (e.g. public profiles) render inside the app shell but must stay
  // reachable without auth so they're shareable.
  const isPublic = publicPrefixes.some((p) => location.pathname.startsWith(p));
  if (isPublic) return children;

  if (decision === 'login') return <LoginRedirect />;
  if (decision === 'onboarding') return <OnboardingRedirect />;
  return children;
}
