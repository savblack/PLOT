/**
 * Cloudflare Turnstile — native (iOS/Android).
 * Hosts the Turnstile widget inside a WebView and posts the token back.
 * `baseUrl` sets the document origin so Turnstile sees an allowed hostname
 * (the widget's domain allowlist is checked against window.location.hostname).
 * Renders nothing when no site key is configured.
 */
import { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export interface TurnstileProps {
  siteKey?: string;
  onToken: (token: string | null) => void;
  resetSignal?: number;
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
  function render(){
    if(!window.turnstile){ setTimeout(render, 120); return; }
    window.__wid = window.turnstile.render('#cf', {
      sitekey: ${JSON.stringify(siteKey)},
      appearance: 'interaction-only',
      callback: function(t){ post({ type:'token', token:t }); },
      'expired-callback': function(){ post({ type:'token', token:null }); },
      'error-callback': function(){ post({ type:'token', token:null }); }
    });
  }
  render();
</script></body></html>`;

export default function Turnstile({ siteKey, onToken, resetSignal = 0, baseUrl = 'https://app.theplot.tv' }: TurnstileProps) {
  const ref = useRef<WebView>(null);
  const lastReset = useRef(resetSignal);

  if (!siteKey) return null;

  // Re-issue a fresh token when the reset signal changes (tokens are single-use).
  if (resetSignal !== lastReset.current) {
    lastReset.current = resetSignal;
    ref.current?.injectJavaScript('window.__wid && window.turnstile.reset(window.__wid); true;');
  }

  return (
    <View style={styles.wrap}>
      <WebView
        ref={ref}
        source={{ html: html(siteKey), baseUrl }}
        onMessage={(e) => {
          try {
            const m = JSON.parse(e.nativeEvent.data);
            if (m?.type === 'token') onToken(m.token ?? null);
          } catch { /* ignore non-JSON messages */ }
        }}
        style={styles.webview}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={[baseUrl, 'https://challenges.cloudflare.com*']}
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
