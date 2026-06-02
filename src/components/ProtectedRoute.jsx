import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import PlotLoader from './PlotLoader';

export default function ProtectedRoute({ children, skipOnboardingCheck = false }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    const checkSession = async (session) => {
      if (!session) {
        setAuthenticated(false);
        setNeedsOnboarding(false);
        setLoading(false);
        return;
      }
      setAuthenticated(true);

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

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => checkSession(session));

    // Stay in sync if session expires or is revoked
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      checkSession(session);
    });

    return () => subscription.unsubscribe();
  }, [skipOnboardingCheck]);

  if (loading) {
    return (
      <div className="app-boot-loader">
        <PlotLoader />
      </div>
    );
  }

  if (!authenticated) return <Navigate to="/login" replace />;
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;
  return children;
}
