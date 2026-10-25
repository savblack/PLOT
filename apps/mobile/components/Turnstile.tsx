/**
 * Cloudflare Turnstile — native (iOS/Android).
 * Hosts the Turnstile widget inside a WebView and posts the token back.
 * `baseUrl` sets the document origin so Turnstile sees an allowed hostname
 * (the widget's domain allowlist is checked against window.location.hostname).
 * Renders nothing when no site key is configured.
 */
import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

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
  /** Origin the challenge runs under — must be in the widget's allowed hostnames. */
  baseUrl?: string;
}

const html = (siteKey: string) => `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
<style>html,body{margin:0;background:transparent}#cf{display:flex;justify-content:center}</style>
</head><body>
<div id="cf"></div>
<script>
  function post(m){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  var cf = document.getElementById('cf');
  // Cloudflare's own rendered size is the only reliable signal for "does this
  // actually need the visitor's attention right now" — report it so the RN
  // side can let touches pass through to whatever's behind it otherwise.
  var wasVisible = false;
  new ResizeObserver(function(){
    var v = cf.offsetWidth > 0 && cf.offsetHeight > 0;
    if (v !== wasVisible) { wasVisible = v; post({ type:'visible', value: v }); }
  }).observe(cf);
  function render(){
    if(!window.turnstile){ setTimeout(render, 120); return; }
    window.__wid = window.turnstile.render('#cf', {
      sitekey: ${JSON.stringify(siteKey)},
      // Hidden unless a challenge genuinely needs interaction. execution
      // "execute" means opening this screen does not start a token.
      appearance: 'interaction-only',
      execution: 'execute',
      retry: 'never',
      callback: function(t){
        window.__errored = false;
        // Hide the confirmation UI the instant we have a token — it's just a
        // "done" flash at this point, not an active prompt, so there's nothing
        // left for the visitor to see or do.
        cf.style.display = 'none';
        post({ type:'token', token:t });
      },
      'expired-callback': function(){ post({ type:'token', token:null }); },
      'error-callback': function(){ window.__errored = true; post({ type:'error' }); }
    });
    if (window.__pending) window.__execute(window.__pending);
  }
  // reset() does not re-run a widget created with execution "execute".
  window.__pending = 0;
  window.__last = 0;
  window.__execute = function(signal) {
    window.__pending = signal;
    if (!window.__wid || !window.turnstile || !window.turnstile.execute) return;
    if (window.__last === signal) return;
    window.__last = signal;
    post({ type:'token', token:null });
    // reset() wipes an interactive challenge. Only do it after a widget error.
    if (window.__errored) {
      window.__errored = false;
      try { window.turnstile.reset(window.__wid); } catch (e) {}
      if (cf) cf.style.display = 'flex';
    }
    try { window.turnstile.execute(window.__wid); } catch (e) {}
  };
  render();
</script></body></html>`;

export default function Turnstile({
  siteKey,
  onToken,
  onError,
  resetSignal = 0,
  executeSignal = 0,
  baseUrl = 'https://app.theplot.tv',
}: TurnstileProps) {
  const ref = useRef<WebView>(null);
  const executeSignalRef = useRef(executeSignal);
  // Whether Cloudflare is currently showing something a visitor could see or
  // tap — drives pointerEvents below so the (normally invisible) widget never
  // steals touches from whatever's positioned behind it.
  const [visible, setVisible] = useState(false);

  const injectExecute = (signal: number) => {
    if (!signal) return;
    ref.current?.injectJavaScript(`window.__execute && window.__execute(${signal}); true;`);
  };

  // Drop a used token. With execution "execute", reset does not start the
  // next challenge. Skip 0 so the first paint does not reset a widget that
  // has not been created yet.
  useEffect(() => {
    if (!resetSignal) return;
    ref.current?.injectJavaScript(
      "window.__wid && window.turnstile.reset(window.__wid); " +
      "var el = document.getElementById('cf'); if (el) el.style.display = 'flex'; " +
      "true;"
    );
  }, [resetSignal]);

  useEffect(() => {
    executeSignalRef.current = executeSignal;
    injectExecute(executeSignal);
  }, [executeSignal]);

  if (!siteKey) return null;

  return (
    <View style={styles.wrap} pointerEvents={visible ? 'auto' : 'none'}>
      <WebView
        ref={ref}
        source={{ html: html(siteKey), baseUrl }}
        onLoadEnd={() => injectExecute(executeSignalRef.current)}
        onMessage={(e) => {
          try {
            const m = JSON.parse(e.nativeEvent.data);
            if (m?.type === 'token') onToken(m.token ?? null);
            else if (m?.type === 'error') {
              onToken(null);
              onError?.();
            } else if (m?.type === 'visible') setVisible(!!m.value);
          } catch { /* ignore non-JSON messages */ }
        }}
        style={styles.webview}
        scrollEnabled={false}
        javaScriptEnabled
        // Turnstile's challenge iframe is built via `srcdoc`, which WebKit/Android
        // resolve to the pseudo-URL `about:srcdoc` rather than a real https: URL —
        // without it here, that navigation is rejected as off-whitelist and the
        // widget dies silently (never fires back a token).
        originWhitelist={['about:srcdoc', baseUrl, 'https://challenges.cloudflare.com*']}
        // keep the widget background transparent
        containerStyle={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 70, width: '100%' },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
