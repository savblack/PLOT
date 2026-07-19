import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { configure } from '@plot/core/config.js';
import router from './router.jsx';
import './index.css';
import posthog from 'posthog-js';
import { PostHogProvider } from '@posthog/react';
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
  // Engagement seams — core fires these from the single canonical spot for each
  // action (any surface), so we never double-count or miss a surface. See
  // packages/core/config.js for the payload contracts.
  onWatchlistRemove: ({ tmdb_id, media_type, source }) =>
    track(EVENTS.WATCHLIST_REMOVED, { tmdb_id, media_type, source }),
  onWatched: ({ tmdb_id, media_type }) =>
    track(EVENTS.MARKED_WATCHED, { tmdb_id, media_type }),
  onRating: ({ tmdb_id, media_type, value }) =>
    track(EVENTS.RATING_SET, { tmdb_id, media_type, value }),
  onFollow: ({ target_user_id, following }) =>
    track(following ? EVENTS.USER_FOLLOWED : EVENTS.USER_UNFOLLOWED, { target_user_id }),
  onCustomListChange: ({ list_id, action }) =>
    track(action === 'created' ? EVENTS.CUSTOM_LIST_CREATED : EVENTS.CUSTOM_LIST_DELETED, { list_id }),
});

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: '2026-01-30',
  // Capture in-app navigation. This is an SPA (react-router createBrowserRouter),
  // so there are no full page loads after boot — 'history_change' fires a single
  // $pageview on each History API navigation. Set explicitly (not left to
  // `defaults`) so route tracking survives any future change to the defaults key.
  capture_pageview: 'history_change',
  // Autocapture clicks / inputs / form submits as a backstop under the curated
  // events in lib/analytics.js — so surfaces we didn't hand-instrument still
  // produce data. Explicit for the same reason as capture_pageview above.
  autocapture: true,
  // Share the anonymous id across theplot.tv ↔ app.theplot.tv so the
  // landing → signup funnel is one funnel. Must match website/js/config.js.
  persistence: 'localStorage+cookie',
  cross_subdomain_cookie: true,
  // Auto-report unhandled errors + promise rejections to PostHog Error Tracking,
  // not just the ones our ErrorBoundaries catch. Turn on Error Tracking in the
  // PostHog project for these to show up.
  capture_exceptions: true,
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
    </PostHogProvider>
  </StrictMode>,
);
