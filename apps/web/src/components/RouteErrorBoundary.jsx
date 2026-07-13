import { useEffect } from 'react';
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { captureException } from '../lib/analytics.js';
import { ErrorScreen, CrashScreen } from './ErrorBoundary.jsx';
import { isChunkError, RELOAD_KEY } from '../utils/chunkError.js';

/**
 * Router-level error element. Catches anything thrown while routing, rendering,
 * or lazy-loading a route — including startup crashes (e.g. missing Supabase
 * env) that would otherwise surface as React Router's raw developer error page.
 */
export default function RouteErrorBoundary() {
  const error = useRouteError();
  const chunk = isChunkError(error);
  // A failed dynamic import is almost always a stale chunk after a deploy —
  // reload once (guarded so we never loop) to pull the fresh build.
  const reloading = chunk && !sessionStorage.getItem(RELOAD_KEY);

  useEffect(() => {
    if (reloading) {
      sessionStorage.setItem(RELOAD_KEY, '1');
      window.location.reload();
      return;
    }
    if (chunk) return; // transient load error, not worth reporting
    console.error('Plot route error:', error);
    captureException(error);
  }, [error, chunk, reloading]);

  if (reloading) return null; // blank flash while the reload kicks in

  // A genuine 404 (e.g. a loader threw a not-found response) gets the playful
  // not-found framing rather than the generic crash screen.
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <ErrorScreen
        code="404"
        title="This scene didn't make the final cut."
        body="Let's get you back to something worth watching."
        primaryLabel="Go home"
        primaryAction={() => { window.location.href = '/'; }}
        ghostLabel="Search titles"
        ghostAction={() => { window.location.href = '/search'; }}
      />
    );
  }

  return <CrashScreen />;
}
