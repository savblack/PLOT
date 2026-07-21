import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../api/supabase';
import PlotLoader from './PlotLoader';
import { getSessionOrNull } from '../utils/authSession.js';
import { AuthUserContext } from '../contexts/AuthUserContext.js';

export default function ProtectedRoute({ children, skipOnboardingCheck = false, publicPrefixes = [] }) {
  const location = useLocation();
  const handedOffUser = location.state?.authenticatedUser ?? null;
  const [loading, setLoading] = useState(() => !handedOffUser);
  const [authenticated, setAuthenticated] = useState(() => !!handedOffUser);
  const [user, setUser] = useState(handedOffUser);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    const checkSession = async (session) => {
      if (!session) {
        setAuthenticated(false);
        setUser(null);
        setNeedsOnboarding(false);
        setLoading(false);
        return;
      }
      setAuthenticated(true);
      setUser(session.user);

      if (!skipOnboardingCheck) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_complete')
          .eq('id', session.user.id)
          .maybeSingle();

        setNeedsOnboarding(!profile?.onboarding_complete);
      }

      setLoading(false);
    };

    // A successful password sign-in already gives us the authenticated user.
    // Reusing that hand-off avoids a second session read while Supabase is
    // finishing its browser-storage update.
    if (handedOffUser) checkSession({ user: handedOffUser });
    else getSessionOrNull(supabase).then(checkSession);

    // Stay in sync if session expires or is revoked
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      checkSession(session);
    });

    return () => subscription.unsubscribe();
  }, [handedOffUser, skipOnboardingCheck]);

  if (loading) {
    return (
      <div className="app-boot-loader">
        <PlotLoader tone="auto" />
      </div>
    );
  }

  // Some routes (e.g. public profiles) render inside the app shell but must stay
  // reachable without auth so they're shareable.
  const isPublic = publicPrefixes.some((p) => location.pathname.startsWith(p));

  if (!authenticated && !isPublic) return <Navigate to="/login" replace />;
  if (needsOnboarding && !isPublic) {
    return <Navigate to="/onboarding" replace state={{ authenticatedUser: user }} />;
  }
  return <AuthUserContext.Provider value={user}>{children}</AuthUserContext.Provider>;
}
