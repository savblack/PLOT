import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { configure } from '@plot/core/config.js';
import router from './router.jsx';
import './index.css';
import posthog from 'posthog-js';
import { PostHogProvider } from '@posthog/react';
import { Analytics } from '@vercel/analytics/react';
import { captureAttribution } from './utils/attribution.js';
import { track, markActivated, EVENTS } from './lib/analytics.js';

// Inject web env into the shared core before anything renders or fetches.
// Core modules read these via getConfig() — never import.meta.env directly.
configure({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  tmdbProxyUrl: import.meta.env.VITE_TMDB_PROXY_URL,
  traktClientId: import.meta.env.VITE_TRAKT_CLIENT_ID,
  isDev: import.meta.env.DEV,
  affiliate: {
    amazonTags: {
      AU: import.meta.env.VITE_AMZ_TAG_AU,
      US: import.meta.env.VITE_AMZ_TAG_US,
      GB: import.meta.env.VITE_AMZ_TAG_GB,
    },
    appleToken: import.meta.env.VITE_APPLE_AT_TOKEN,
  },
  // Analytics seam: core fires this once per genuinely new watchlist add (any
  // surface). Previously only the /save deep link emitted watchlist_saved; now
  // every in-app save does too, and a first save counts as activation.
  onWatchlistSave: ({ tmdb_id, media_type, source }) => {
    track(EVENTS.WATCHLIST_SAVED, { tmdb_id, media_type, source, already_saved: false });
    markActivated('first_save', { source });
  },
});

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: '2026-01-30',
  // Share the anonymous id across theplot.tv ↔ app.theplot.tv so the
  // landing → signup funnel is one funnel. Must match website/js/config.js.
  persistence: 'localStorage+cookie',
  cross_subdomain_cookie: true,
});

// Read the acquisition attribution the marketing site forwarded onto this link
// (utm_*, click ids, referrer, src) and attach it to every event + the person,
// so signup / activation stay traceable to their source. First-touch wins.
const attribution = captureAttribution();
if (Object.keys(attribution).length > 0) {
  posthog.register(attribution);
  posthog.setPersonProperties(undefined, attribution);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PostHogProvider client={posthog}>
      <RouterProvider router={router} />
      <Analytics />
    </PostHogProvider>
  </StrictMode>,
);
