import { useEffect, useRef, useState } from 'react';
import { AUTH_PAGE } from '../copy/authPage.js';

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
      // Without this, anything thrown inside Cloudflare's script reaches
      // window.onerror as the opaque "Script error." with no message and no
      // stack — the browser's same-origin policy for script errors. PostHog
      // then captures an Error Tracking issue nobody can act on, which is
      // exactly what happened on 2026-08-31. challenges.cloudflare.com serves
      // the script with `access-control-allow-origin: *` on both the 302 and
      // the redirect target, so opting into CORS here costs nothing and makes
      // any future Turnstile breakage legible on the signup path.
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve();
      s.onerror = () => { scriptPromise = null; reject(new Error('Turnstile failed to load')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// One failure is enough to arm signup-bypass. Waiting for a second failure
// never happened in practice (signup_captcha_blocked fired, signup_bypass_offered
// did not), so the email path stayed disabled. A later success still clears it.
const PERSISTENT_FAILURE_THRESHOLD = 1;

/**
 * @param {object}   props
 * @param {string}   [props.siteKey]    Turnstile site key; when falsy the widget is not rendered.
 * @param {Function} props.onToken      Called with the token string on success, or null on expiry/error/reset.
 * @param {number}   [props.resetSignal] Bump this number to drop the current token without running a new challenge.
 * @param {number}   [props.executeSignal] Bump this number to run the challenge. The widget
 *                                      does not run on load. reset() alone does not re-run it.
 * @param {Function} [props.onBlocked]  Called with the 1-based attempt number each time the
 *                                      widget fails to load or errors, for tracking incidence.
 * @param {Function} [props.onPersistentlyBlocked] Called with true once failures cross
 *                                      PERSISTENT_FAILURE_THRESHOLD (signals a caller may want
 *                                      to offer an alternate path), and again with false if the
 *                                      widget later succeeds (e.g. after Retry actually works).
 * @param {string}   [props.failureMessage] First-failure line. Neutral unless the caller
 *                                      passes signup copy. Login, reset, and magic link have no bypass.
 * @param {string}   [props.blockedMessage] Persistent-failure line. Same rule as failureMessage.
 */
export default function Turnstile({
  siteKey,
  onToken,
  resetSignal = 0,
  executeSignal = 0,
  onBlocked,
  onPersistentlyBlocked,
  failureMessage = AUTH_PAGE.verificationFailed,
  blockedMessage = AUTH_PAGE.verificationBlocked,
}) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenRef = useRef(onToken);
  const onBlockedRef = useRef(onBlocked);
  const onPersistentlyBlockedRef = useRef(onPersistentlyBlocked);
  const [failCount, setFailCount] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const executeSignalRef = useRef(0);
  const lastExecutedRef = useRef(0);
  const runExecuteRef = useRef(() => {});
  // reset() during an interactive challenge throws away the solve. Only a
  // widget error earns a reset. A timeout leaves the challenge on screen.
  const widgetErroredRef = useRef(false);

  // Keep the latest callbacks without re-running the render effect below.
  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);
  useEffect(() => { onBlockedRef.current = onBlocked; }, [onBlocked]);
  useEffect(() => { onPersistentlyBlockedRef.current = onPersistentlyBlocked; }, [onPersistentlyBlocked]);

  useEffect(() => {
    runExecuteRef.current = () => {
      const signal = executeSignalRef.current;
      if (!signal || lastExecutedRef.current === signal) return;
      const id = widgetIdRef.current;
      if (!id || !window.turnstile?.execute) return;
      lastExecutedRef.current = signal;
      if (widgetErroredRef.current) {
        widgetErroredRef.current = false;
        try { window.turnstile.reset(id); } catch { /* widget already gone */ }
      }
      onTokenRef.current?.(null);
      try { window.turnstile.execute(id); } catch { /* widget already gone */ }
    };
  }, []);

  // Render once per site key (and again on manual retry).
  useEffect(() => {
    if (!siteKey) return undefined;
    let cancelled = false;
    const reportFailure = () => {
      if (cancelled) return;
      widgetErroredRef.current = true;
      setFailCount((n) => {
        const next = n + 1;
        onBlockedRef.current?.(next);
        if (next === PERSISTENT_FAILURE_THRESHOLD) onPersistentlyBlockedRef.current?.(true);
        return next;
      });
    };
    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          // Hidden unless a challenge genuinely needs interaction. The
          // challenge itself waits for execute(), so opening the form does
          // not start a token that can expire before the person submits.
          appearance: 'interaction-only',
          execution: 'execute',
          retry: 'never',
          callback: (token) => {
            widgetErroredRef.current = false;
            onTokenRef.current?.(token);
            if (cancelled) return;
            setFailCount((n) => { if (n >= PERSISTENT_FAILURE_THRESHOLD) onPersistentlyBlockedRef.current?.(false); return 0; });
          },
          'expired-callback': () => onTokenRef.current?.(null),
          'error-callback': () => { onTokenRef.current?.(null); reportFailure(); },
        });
        runExecuteRef.current();
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

  // Reset to a fresh token when asked (tokens are single-use). With
  // execution "execute", reset does not start the next challenge.
  useEffect(() => {
    if (!resetSignal || !widgetIdRef.current || !window.turnstile) return;
    try { window.turnstile.reset(widgetIdRef.current); } catch { /* widget already gone */ }
    onTokenRef.current?.(null);
  }, [resetSignal]);

  useEffect(() => {
    executeSignalRef.current = executeSignal;
    runExecuteRef.current();
  }, [executeSignal]);

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
      {failCount > 1 ? (
        <p className="auth-turnstile-error">
          {failCount > PERSISTENT_FAILURE_THRESHOLD + 1 ? blockedMessage : failureMessage}{' '}
          <button type="button" onClick={() => setRetryNonce((n) => n + 1)}>
            {AUTH_PAGE.verificationRetry}
          </button>
        </p>
      ) : null}
    </div>
  );
}
