/**
 * Cloudflare Turnstile — web build.
 * Port of the web app's src/components/Turnstile.jsx: loads the Turnstile
 * script and renders the widget into a real DOM node (Expo web = react-native-web
 * + ReactDOM, so intrinsic elements are available in this .web file).
 * Renders nothing when no site key is configured.
 */
import { useEffect, useRef } from 'react';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

declare global {
  interface Window { turnstile?: any }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
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

export interface TurnstileProps {
  siteKey?: string;
  onToken: (token: string | null) => void;
  /** Widget error (script or challenge). Distinct from an expired token. */
  onError?: () => void;
  resetSignal?: number;
  /**
   * Bump to run the challenge. The widget does not run when the screen opens.
   * reset() alone does not re-run it.
   */
  executeSignal?: number;
}

export default function Turnstile({
  siteKey,
  onToken,
  onError,
  resetSignal = 0,
  executeSignal = 0,
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  const executeSignalRef = useRef(0);
  const lastExecutedRef = useRef(0);
  const runExecuteRef = useRef(() => {});
  const widgetErroredRef = useRef(false);

  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

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

  useEffect(() => {
    if (!siteKey) return undefined;
    let cancelled = false;
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
          callback: (token: string) => {
            widgetErroredRef.current = false;
            onTokenRef.current?.(token);
          },
          'expired-callback': () => onTokenRef.current?.(null),
          'error-callback': () => {
            widgetErroredRef.current = true;
            onTokenRef.current?.(null);
            onErrorRef.current?.();
          },
        });
        runExecuteRef.current();
      })
      .catch(() => {
        widgetErroredRef.current = true;
        onTokenRef.current?.(null);
        onErrorRef.current?.();
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* already gone */ }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  // With execution "execute", reset does not start the next challenge.
  useEffect(() => {
    if (!resetSignal || !widgetIdRef.current || !window.turnstile) return;
    try { window.turnstile.reset(widgetIdRef.current); } catch { /* already gone */ }
    onTokenRef.current?.(null);
  }, [resetSignal]);

  useEffect(() => {
    executeSignalRef.current = executeSignal;
    runExecuteRef.current();
  }, [executeSignal]);

  if (!siteKey) return null;
  // No reserved height — interaction-only keeps the widget hidden until (if
  // ever) a challenge is required, and challenges render as an overlay.
  return <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center' }} />;
}
