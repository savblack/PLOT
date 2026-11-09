import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { rememberReturnPath } from '../utils/authReturn.js';

/** Send a signed-out visitor to /login, remembering where they were headed. */
export default function LoginRedirect() {
  const location = useLocation();
  useEffect(() => {
    rememberReturnPath(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);
  return <Navigate to="/login" replace />;
}

/**
 * Send a signed-in visitor who still needs setup to /onboarding, remembering
 * the page they asked for. Login already stored that path, then consumed it
 * on the way back. This writes it again so finishing setup returns there,
 * query string included.
 */
export function OnboardingRedirect() {
  const location = useLocation();
  useEffect(() => {
    rememberReturnPath(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);
  return <Navigate to="/onboarding" replace />;
}
