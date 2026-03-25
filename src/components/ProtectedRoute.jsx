import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import PlotLoader from './PlotLoader';

export default function ProtectedRoute({ children, skipOnboardingCheck = false }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      setAuthenticated(true);

      if (!skipOnboardingCheck) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_complete')
          .eq('id', session.user.id)
          .maybeSingle();

        if (!profile?.onboarding_complete) {
          // In dev, also update the DB so this doesn't repeat
          if (import.meta.env.DEV) {
            await supabase.from('profiles').upsert({ id: session.user.id, onboarding_complete: true });
          } else {
            setNeedsOnboarding(true);
          }
        }
      }

      setLoading(false);
    };
    check();
  }, [skipOnboardingCheck]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PlotLoader />
      </div>
    );
  }

  if (!authenticated) return <Navigate to="/login" replace />;
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;
  return children;
}
