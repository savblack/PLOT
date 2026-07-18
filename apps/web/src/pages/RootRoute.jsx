import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import PlotLoader from '../components/PlotLoader';

// The marketing site is the only landing page — the app never serves one.
const MARKETING_URL = 'https://theplot.tv';

export default function RootRoute() {
  const [loading,       setLoading]       = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(!!session);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!loading && !authenticated) {
      window.location.replace(MARKETING_URL);
    }
  }, [loading, authenticated]);

  // Authenticated users land on Home, which opens on the Feed sub-tab.
  if (!loading && authenticated) return <Navigate to="/home" replace />;

  // Loading, or logged out and about to leave for the marketing site.
  return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <PlotLoader />
    </div>
  );
}
