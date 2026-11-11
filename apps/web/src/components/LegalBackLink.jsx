// The Back link on the standalone legal pages (Terms, Privacy, Community
// Standards). These routes sit outside the app shell, so there is no useApp()
// here: the session check reads the stored session directly.
// Web only: mobile opens the legal pages in the system browser.
import { useEffect, useState } from 'react';
import { supabase } from '@plot/core/supabase.js';
import { COMMON } from '../copy/common.js';
import BackLink from './BackLink.jsx';

/**
 * Goes back to wherever the reader came from inside the app. Opened directly
 * (a new tab, a link from the marketing site) there is nothing to go back to,
 * so it leads Home for a signed-in reader and to sign-in otherwise.
 */
export default function LegalBackLink() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (alive) setSignedIn(!!data?.session); })
      .catch(() => { /* no session readable: keep the signed-out fallback */ });
    return () => { alive = false; };
  }, []);

  return <BackLink to={signedIn ? '/home' : '/login'} label={COMMON.back} history className="legal-back" />;
}
