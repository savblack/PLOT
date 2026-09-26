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
