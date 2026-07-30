import { useEffect, useRef, useState } from 'react';

// Cloudflare Turnstile — invisible/managed CAPTCHA for Supabase Auth.
// Renders nothing when no site key is configured (local dev / CI), so the
// component is a no-op until Turnstile is enabled in the Supabase dashboard.

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise = null;
function loadScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptPromise = null; reject(new Error('Turnstile failed to load')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// Retrying past this many failures hasn't recovered a real network blip by
// now — it's almost always a persistent block (ad blocker / privacy
// extension), which a retry can't fix. Switch to naming that instead of
// repeating the same generic message forever.
const PERSISTENT_FAILURE_THRESHOLD = 2;

/**
 * @param {object}   props
 * @param {string}   [props.siteKey]    Turnstile site key; when falsy the widget is not rendered.
 * @param {Function} props.onToken      Called with the token string on success, or null on expiry/error/reset.
 * @param {number}   [props.resetSignal] Bump this number to force the widget to issue a fresh token.
 * @param {Function} [props.onBlocked]  Called with the 1-based attempt number each time the
 *                                      widget fails to load or errors, for tracking incidence.
 */
export default function Turnstile({ siteKey, onToken, resetSignal = 0, onBlocked }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenRef = useRef(onToken);
  const onBlockedRef = useRef(onBlocked);
  const [failCount, setFailCount] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);

  // Keep the latest callbacks without re-running the render effect below.
  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);
  useEffect(() => { onBlockedRef.current = onBlocked; }, [onBlocked]);

  // Render once per site key (and again on manual retry).
  useEffect(() => {
    if (!siteKey) return undefined;
    let cancelled = false;
    const reportFailure = () => {
      if (cancelled) return;
      setFailCount((n) => {
        const next = n + 1;
        onBlockedRef.current?.(next);
        return next;
      });
    };
    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          // Hidden unless a challenge genuinely needs interaction — no visible
          // Cloudflare box in the normal auto-pass flow.
          appearance: 'interaction-only',
          callback: (token) => { onTokenRef.current?.(token); if (!cancelled) setFailCount(0); },
          'expired-callback': () => onTokenRef.current?.(null),
          'error-callback': () => { onTokenRef.current?.(null); reportFailure(); },
        });
      })
      .catch(() => { onTokenRef.current?.(null); reportFailure(); });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* widget already gone */ }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, retryNonce]);

  // Reset to a fresh token when asked (tokens are single-use).
  useEffect(() => {
    if (!resetSignal || !widgetIdRef.current || !window.turnstile) return;
    try { window.turnstile.reset(widgetIdRef.current); } catch { /* widget already gone */ }
    onTokenRef.current?.(null);
  }, [resetSignal]);

  if (!siteKey) return null;
  // No reserved height — interaction-only keeps the widget hidden until (if
  // ever) a challenge is required, and challenges render as an overlay.
  return (
    <div>
      <div
        ref={containerRef}
        className="auth-turnstile"
        style={{ display: 'flex', justifyContent: 'center' }}
      />
      {failCount >= PERSISTENT_FAILURE_THRESHOLD ? (
        <p className="auth-turnstile-error">
          Still no luck. This usually means an ad blocker or privacy extension is blocking
          Cloudflare's script. Try disabling it or use a different browser.{' '}
          <button type="button" onClick={() => setRetryNonce((n) => n + 1)}>
            Retry
          </button>
        </p>
      ) : failCount > 0 ? (
        <p className="auth-turnstile-error">
          Verification failed to load. This can happen with ad blockers or strict privacy
          settings.{' '}
          <button type="button" onClick={() => setRetryNonce((n) => n + 1)}>
            Retry
          </button>
        </p>
      ) : null}
    </div>
  );
}
