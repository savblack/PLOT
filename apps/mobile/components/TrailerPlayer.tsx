/**
 * Inline YouTube trailer player — native (iOS/Android).
 *
 * Plays the trailer INSIDE the app. The embed is wrapped in an HTML document
 * loaded with a real `baseUrl` origin (not navigated to /embed/ directly) —
 * loading the embed URL as the top document trips YouTube "Error 153"
 * (player configuration). `playsinline` + allowsInlineMediaPlayback keep it in
 * the panel; the fullscreen control still works.
 *
 * A `.web.tsx` sibling renders a plain <iframe>, so this file's
 * react-native-webview import never reaches the web bundle.
 */
import { WebView } from 'react-native-webview';

// A real, NON-youtube https origin. Framing the embed from a youtube.com origin
// trips "Error 153"; the embed must be framed cross-origin, with a matching
// ?origin= param so YouTube accepts the player configuration.
const BASE_URL = 'https://app.theplot.tv';

const html = (key: string) => `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>*{margin:0;padding:0}html,body{height:100%;background:#000;overflow:hidden}
.wrap{position:absolute;top:0;left:0;right:0;bottom:0}iframe{width:100%;height:100%;border:0}</style>
</head><body><div class="wrap">
<iframe src="https://www.youtube.com/embed/${key}?autoplay=1&playsinline=1&rel=0&modestbranding=1&fs=1&origin=${encodeURIComponent(BASE_URL)}"
  allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
</div></body></html>`;

// YouTube video IDs are exactly 11 URL-safe characters; reject anything else
// before it's interpolated into the embed HTML.
const isValidVideoKey = (key: string) => /^[\w-]{11}$/.test(key);

export function TrailerPlayer({ videoKey }: { videoKey: string }) {
  if (!isValidVideoKey(videoKey)) return null;

  return (
    <WebView
      source={{ html: html(videoKey), baseUrl: BASE_URL }}
      style={{ flex: 1, backgroundColor: '#000' }}
      originWhitelist={[BASE_URL, 'https://www.youtube.com', 'https://youtube.com']}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      allowsFullscreenVideo
      javaScriptEnabled
      domStorageEnabled
      // Fixed 16:9 embed never scrolls internally — let vertical drags over the
      // player pass through to the panel's ScrollView instead of being captured.
      scrollEnabled={false}
      nestedScrollEnabled
    />
  );
}
