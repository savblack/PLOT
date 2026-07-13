/**
 * Inline YouTube trailer player — web build (expo-web / react-native-web).
 * Renders a real <iframe> (ReactDOM intrinsic) so react-native-webview, which
 * has no web implementation, is never imported on web.
 */
export function TrailerPlayer({ videoKey }: { videoKey: string }) {
  const src = `https://www.youtube.com/embed/${videoKey}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
  return (
    <iframe
      src={src}
      title="Trailer"
      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}
