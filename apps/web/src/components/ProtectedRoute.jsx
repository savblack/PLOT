import { useState, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import {
  cachedProfileSkipsOnboardingGate,
  onboardingGuardDecision,
  readOnboardingUntilDecided,
} from '@plot/core/onboardingGate.js';
import LoginRedirect, { OnboardingRedirect } from './LoginRedirect.jsx';
import { isPreviewDeployment } from '../utils/previewDeployment.js';
import { readCachedSession, clearCachedSession } from '../utils/sessionCache.js';
import { loadSupabase } from '../utils/loadSupabase.js';

export default function ProtectedRoute({ children, skipOnboardingCheck = false, publicPrefixes = [] }) {
  const location = useLocation();
  const isPreview = isPreviewDeployment();
  const skip = skipOnboardingCheck || isPreview;
  // This gate sits above App.jsx, so its own loading state blocks App from
  // ever mounting. A cached profile that is already finished may render the
  // app while the live row is re-read. Anything short of that stays on the
  // loader: a missing or stale "not finished" cache used to redirect before
  // the profile request returned, and the onboarding route does not re-check.
  const [authReady, setAuthReady] = useState(() => !!readCachedSession());
  const [authenticated, setAuthenticated] = useState(() => !!readCachedSession());
  const [profileDecided, setProfileDecided] = useState(() => {
    const cached = readCachedSession();
    return skip || cachedProfileSkipsOnboardingGate(cached?.profile);
  });
  const [onboardingComplete, setOnboardingComplete] = useState(() => {
    const cached = readCachedSession();
    return !skip && cachedProfileSkipsOnboardingGate(cached?.profile);
  });
  const decidedUserId = useRef(
    /** @type {string | null} */ (
      !skip && cachedProfileSkipsOnboardingGate(readCachedSession()?.profile)
        ? readCachedSession()?.userId ?? null
        : null
    ),
  );

  useEffect(() => {
    let subscription;
    let cancelled = false;
    let generation = 0;

    const apply = async (supabase, session) => {
      const gen = ++generation;
      const stop = () => cancelled || gen !== generation;

      if (!session) {
        decidedUserId.current = null;
        setAuthenticated(false);
        setOnboardingComplete(false);
        setProfileDecided(true);
        setAuthReady(true);
        clearCachedSession();
        return;
      }

      setAuthenticated(true);
      setAuthReady(true);
      if (skip) {
        setProfileDecided(true);
        return;
      }

      const userId = session.user.id;
      const cached = readCachedSession();
      const knownComplete = cached?.userId === userId && cachedProfileSkipsOnboardingGate(cached.profile);
      const alreadyDecided = decidedUserId.current === userId;

      if (knownComplete && !alreadyDecided) {
        decidedUserId.current = userId;
        setOnboardingComplete(true);
        setProfileDecided(true);
      } else if (!alreadyDecided && !knownComplete) {
        setOnboardingComplete(false);
        setProfileDecided(false);
      }

      const read = await readOnboardingUntilDecided(
        () => supabase
          .from('profiles')
          .select('onboarding_complete')
          .eq('id', userId)
          .maybeSingle(),
        {
          shouldStop: stop,
          // A later token refresh must not sit in a retry loop, and must not
          // replace a decision we already have when the read comes back empty.
          maxAttempts: (alreadyDecided || knownComplete) ? 1 : Number.POSITIVE_INFINITY,
        },
      );
      if (stop() || !read.decided) return;
      decidedUserId.current = userId;
      setOnboardingComplete(read.onboardingComplete);
      setProfileDecided(true);
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
    profileDecided,
    onboardingComplete,
    skipOnboardingCheck: skip,
  });

  if (decision === 'loading') {
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
