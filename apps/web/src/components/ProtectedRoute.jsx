import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import { isPreviewDeployment } from '../utils/previewDeployment.js';
import { readCachedSession, clearCachedSession } from '../utils/sessionCache.js';
import { loadSupabase } from '../utils/loadSupabase.js';

export default function ProtectedRoute({ children, skipOnboardingCheck = false, publicPrefixes = [] }) {
  const location = useLocation();
  const isPreview = isPreviewDeployment();
  // This gate sits above App.jsx, so its own loading state blocks App from
  // ever mounting (and thus from ever reaching App's own optimistic cache) —
  // it needs the same last-known-good guess so a returning, already-logged-in
  // visit doesn't sit behind a boot loader for the round-trip below.
  const cached = readCachedSession();
  const [loading, setLoading] = useState(!cached);
  const [authenticated, setAuthenticated] = useState(!!cached);
  const [needsOnboarding, setNeedsOnboarding] = useState(() =>
    cached && !skipOnboardingCheck && !isPreview ? !cached.profile?.onboarding_complete : false
  );

  useEffect(() => {
    let subscription;
    let cancelled = false;

    const checkSession = async (supabase, session) => {
      if (cancelled) return;
      if (!session) {
        setAuthenticated(false);
        setNeedsOnboarding(false);
        setLoading(false);
        clearCachedSession();
        return;
      }
      setAuthenticated(true);

      if (!skipOnboardingCheck && !isPreview) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_complete')
          .eq('id', session.user.id)
          .maybeSingle();

        setNeedsOnboarding(!profile?.onboarding_complete);
      }

      setLoading(false);
    };

    loadSupabase().then(async (supabase) => {
      if (cancelled) return;
      const { data: { session } } = await supabase.auth.getSession();
      await checkSession(supabase, session);
      if (cancelled) return;

      // Stay in sync if session expires or is revoked.
      ({ data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        checkSession(supabase, nextSession);
      }));
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [isPreview, skipOnboardingCheck]);

  if (loading) {
    return (
      <div className="app-boot-loader">
        <PlotLoader />
      </div>
    );
  }

  // Some routes (e.g. public profiles) render inside the app shell but must stay
  // reachable without auth so they're shareable.
  const isPublic = publicPrefixes.some((p) => location.pathname.startsWith(p));

  if (!authenticated && !isPublic) return <Navigate to="/login" replace />;
  if (needsOnboarding && !isPublic) return <Navigate to="/onboarding" replace />;
  return children;
}
