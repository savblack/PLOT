import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { edgeFunctionUrl } from '@plot/core/functions.js';
import { NEWSLETTER_UNSUBSCRIBE as U } from '@plot/core/copy/newsletterUnsubscribe.js';
// A public page opened straight from an email: it does not go through the app
// shell, so it loads the shared button styles itself (as PlansPage does).
import '../styles/app.css';
import './NewsletterUnsubscribePage.css';

/**
 * /newsletter/unsubscribe?token=...
 *
 * Where the Unsubscribe link in the weekly digest lands. A real page because
 * Supabase serves anything from a function as plain text under a sandbox CSP,
 * so the function's own HTML could never be shown to a person. The page asks
 * once, then POSTs to newsletter-subscribe, which looks the token up in
 * marketing_subscribers. Logged-out, no session needed: the token is the
 * authority. A GET never unsubscribes anyone (mail scanners and link previews
 * open links), only the button does.
 *
 * This is the digest's consent only. Streaming alert emails have their own page
 * (/email/unsubscribe) and a different token; the two are deliberately not merged.
 */
export default function NewsletterUnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const url = token ? edgeFunctionUrl('newsletter-subscribe', { action: 'unsubscribe', token }) : null;
  // ask | working | done | invalid | error
  const [phase, setPhase] = useState(url ? 'ask' : 'invalid');

  const confirm = async () => {
    setPhase('working');
    try {
      const res = await fetch(url, { method: 'POST' });
      setPhase(res.ok ? 'done' : res.status === 404 ? 'invalid' : 'error');
    } catch {
      setPhase('error');
    }
  };

  const copy = {
    ask: [U.title, U.body],
    working: [U.title, U.body],
    done: [U.doneTitle, U.doneBody],
    invalid: [U.invalidTitle, U.invalidBody],
    error: [U.errorTitle, U.errorBody],
  }[phase];

  return (
    <main className="news-unsub">
      <div className="news-unsub-card">
        <h1 className="news-unsub-title">{copy[0]}</h1>
        <p className="news-unsub-body">{copy[1]}</p>
        {(phase === 'ask' || phase === 'working') && (
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={phase === 'working'}>
            {phase === 'working' ? U.working : U.button}
          </button>
        )}
        {phase === 'error' && <button type="button" className="btn btn-primary" onClick={confirm}>{U.button}</button>}
        {(phase === 'done' || phase === 'invalid' || phase === 'error') && (
          <p className="news-unsub-link"><Link to="/">{U.home}</Link></p>
        )}
      </div>
    </main>
  );
}
