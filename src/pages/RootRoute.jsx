import { Suspense, lazy, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import PlotLoader from '../components/PlotLoader';

const LandingPage = lazy(() => import('./LandingPage'));

export default function RootRoute() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(!!session);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PlotLoader />
      </div>
    );
  }

  if (authenticated) return <Navigate to="/app" replace />;
  return (
    <Suspense fallback={<PlotLoader />}>
      <LandingPage />
    </Suspense>
  );
}
