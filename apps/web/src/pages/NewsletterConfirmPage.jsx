import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { edgeFunctionUrl } from '@plot/core/functions.js';
import { EVENTS } from '@plot/core/analyticsEvents.js';
import { FAILED_ACTIONS, reportActionFailure } from '@plot/core/actionFailures.js';
import { NEWSLETTER_CONFIRM as C } from '@plot/core/copy/newsletterConfirm.js';
import { track } from '../lib/analytics.js';
// A public page opened straight from an email, like the unsubscribe page: it
// does not go through the app shell, so it loads the shared button styles
// itself and reuses that page's card layout.
import '../styles/app.css';
import './NewsletterUnsubscribePage.css';

/**
 * /newsletter/confirm?token=...
 *
 * Where the link in the digest's confirmation email lands (double opt-in). A
 * website signup is stored as 'pending' and only starts getting the digest once
 * this button POSTs the token to newsletter-subscribe. Logged-out, no session:
 * the token is the authority. Opening the page changes nothing; mail scanners
 * and link previews open links, so only the button confirms.
 *
 * Web only: the link is opened in a browser from an email, so there is no
 * mobile screen for it.
 */
export default function NewsletterConfirmPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const url = token ? edgeFunctionUrl('newsletter-subscribe', { action: 'confirm', token }) : null;
  // ask | working | done | invalid | expired | error
  const [phase, setPhase] = useState(url ? 'ask' : 'invalid');

  const confirm = async () => {
    setPhase('working');
    try {
      const res = await fetch(url, { method: 'POST' });
      if (res.ok) {
        track(EVENTS.NEWSLETTER_CONFIRMED);
        setPhase('done');
        return;
      }
      if (res.status === 404) { setPhase('invalid'); return; }
      if (res.status === 410) { setPhase('expired'); return; }
      reportActionFailure(FAILED_ACTIONS.NEWSLETTER_CONFIRM, { status: res.status }, { kind: 'server' });
      setPhase('error');
    } catch (error) {
      reportActionFailure(FAILED_ACTIONS.NEWSLETTER_CONFIRM, error, { kind: 'network' });
      setPhase('error');
    }
  };

  const copy = {
    ask: [C.title, C.body],
    working: [C.title, C.body],
    done: [C.doneTitle, C.doneBody],
    invalid: [C.invalidTitle, C.invalidBody],
    expired: [C.expiredTitle, C.expiredBody],
    error: [C.errorTitle, C.errorBody],
  }[phase];

  return (
    <main className="news-unsub">
      <div className="news-unsub-card">
        <h1 className="news-unsub-title">{copy[0]}</h1>
        <p className="news-unsub-body">{copy[1]}</p>
        {(phase === 'ask' || phase === 'working') && (
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={phase === 'working'}>
            {phase === 'working' ? C.working : C.button}
          </button>
        )}
        {phase === 'error' && <button type="button" className="btn btn-primary" onClick={confirm}>{C.button}</button>}
        {phase !== 'ask' && phase !== 'working' && (
          <p className="news-unsub-link"><Link to="/">{C.home}</Link></p>
        )}
      </div>
    </main>
  );
}
