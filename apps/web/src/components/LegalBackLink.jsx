// The "← Back" link on the standalone legal pages (Terms, Privacy, Community
// Standards). These routes sit outside the app shell, so there is no useApp()
// here: the session check reads the stored session directly.
// Web only: mobile opens the legal pages in the system browser.
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@plot/core/supabase.js';

/**
 * Goes back to wherever the reader came from inside the app. Opened directly
 * (a new tab, a link from the marketing site) there is nothing to go back to,
 * so it leads Home for a signed-in reader and to sign-in otherwise.
 */
export default function LegalBackLink() {
  const location = useLocation();
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (alive) setSignedIn(!!data?.session); })
      .catch(() => { /* no session readable: keep the signed-out fallback */ });
    return () => { alive = false; };
  }, []);

  // react-router gives the first entry of a visit the key "default"; any other
  // key means this page was reached by an in-app navigation.
  const hasInAppHistory = location.key !== 'default';
  const onClick = (e) => {
    if (!hasInAppHistory || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(-1);
  };

  return <Link to={signedIn ? '/home' : '/login'} className="legal-back" onClick={onClick}>← Back</Link>;
}
