import { useEffect, useRef } from 'react';

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

/**
 * @param {object}   props
 * @param {string}   [props.siteKey]    Turnstile site key; when falsy the widget is not rendered.
 * @param {Function} props.onToken      Called with the token string on success, or null on expiry/error/reset.
 * @param {number}   [props.resetSignal] Bump this number to force the widget to issue a fresh token.
 */
export default function Turnstile({ siteKey, onToken, resetSignal = 0 }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenRef = useRef(onToken);

  // Keep the latest callback without re-running the render effect below.
  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);

  // Render once per site key.
  useEffect(() => {
    if (!siteKey) return undefined;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onTokenRef.current?.(token),
          'expired-callback': () => onTokenRef.current?.(null),
          'error-callback': () => onTokenRef.current?.(null),
        });
      })
      .catch(() => { onTokenRef.current?.(null); });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* widget already gone */ }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  // Reset to a fresh token when asked (tokens are single-use).
  useEffect(() => {
    if (!resetSignal || !widgetIdRef.current || !window.turnstile) return;
    try { window.turnstile.reset(widgetIdRef.current); } catch { /* widget already gone */ }
    onTokenRef.current?.(null);
  }, [resetSignal]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="auth-turnstile" style={{ minHeight: 65 }} />;
}
