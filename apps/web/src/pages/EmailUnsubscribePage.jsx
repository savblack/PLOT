import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { edgeFunctionUrl } from '@plot/core/functions.js';
import { ALERT_EMAIL } from '@plot/core/copy/alertEmail.js';
// A public page opened straight from an email: it does not go through the app
// shell, so it loads the shared button styles itself (as PlansPage does).
import '../styles/app.css';
import './EmailUnsubscribePage.css';

/**
 * /email/unsubscribe?token=...
 *
 * Where the Unsubscribe link in a streaming alert email lands. A real page
 * because Supabase serves anything from a function as plain text, so the
 * function's own confirmation page cannot be shown to a person. The page asks
 * once, then POSTs to alert-email-unsubscribe, which checks the signed token and
 * turns alert email off. Logged-out, no session needed: the token is the
 * authority, and it can only ever turn alert email OFF. A GET never unsubscribes
 * anyone (mail scanners and link previews open links), only the button does.
 *
 * Works on any plan and regardless of ALERT_EMAIL_ENABLED: withdrawing consent
 * is never gated. The weekly digest has its own, separate unsubscribe.
 */
const U = ALERT_EMAIL.unsubscribe;

export default function EmailUnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const url = token ? edgeFunctionUrl('alert-email-unsubscribe', { token }) : null;
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
    <main className="email-unsub">
      <div className="email-unsub-card">
        <h1 className="email-unsub-title">{copy[0]}</h1>
        <p className="email-unsub-body">{copy[1]}</p>
        {(phase === 'ask' || phase === 'working') && (
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={phase === 'working'}>
            {phase === 'working' ? U.working : U.button}
          </button>
        )}
        {phase === 'error' && <button type="button" className="btn btn-primary" onClick={confirm}>{U.button}</button>}
        {(phase === 'done' || phase === 'invalid' || phase === 'error') && (
          <p className="email-unsub-link"><Link to="/settings?section=viewing">{U.settings}</Link></p>
        )}
      </div>
    </main>
  );
}
