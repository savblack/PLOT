import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { configure } from '@plot/core/config.js';
import router from './router.jsx';
import './index.css';
import { captureAttribution } from './utils/attribution.js';
import { redactSensitiveUrl } from './utils/redactUrl.js';
import { track, markActivated, EVENTS, _setPostHogClient } from './lib/analytics.js';

// Inject web env into the shared core before anything renders or fetches.
// Core modules read these via getConfig() — never import.meta.env directly.
configure({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  tmdbProxyUrl: import.meta.env.VITE_TMDB_PROXY_URL,
  watchAvailabilityUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/watch-availability`,
  criticScoreUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/critic-score`,
  traktClientId: import.meta.env.VITE_TRAKT_CLIENT_ID,
  isDev: import.meta.env.DEV,
  // PKCE instead of Supabase's default implicit flow. Implicit returns the
  // session in the URL fragment (`#access_token=…&refresh_token=…`), which puts
  // a long-lived refresh token into the address bar, browser history, and every
  // analytics tool watching the page. PKCE returns a single-use `?code=` bound
  // to a verifier held in this browser's localStorage, so the URL carries
  // nothing reusable. utils/authCallback.js already handles the `code` branch.
  //
  // Safe only because the email templates now link to /auth/callback with
  // `?token_hash=…&type=…` rather than {{ .ConfirmationURL }}: token_hash goes
  // through verifyOtp, which needs no verifier, so opening a magic link or a
  // password reset on a different device than the one that requested it still
  // works. Reverting the templates without reverting this breaks that.
  supabaseClientOptions: { auth: { flowType: 'pkce' } },
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

// Opt this browser out of analytics: visit either theplot.tv or app.theplot.tv
// once with ?dnt=1 to set a 1yr cookie shared across both subdomains.
if (new URLSearchParams(window.location.search).get('dnt') === '1') {
  document.cookie = 'plot_dnt=1; domain=.theplot.tv; path=/; max-age=31536000';
}
const isDnt = /(?:^|; )plot_dnt=1/.test(document.cookie);

const posthogToken = !isDnt && import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;

// Read the acquisition attribution the marketing site forwarded onto this link
// (utm_*, click ids, referrer, src) and attach it to every event + the person,
// so signup / activation stay traceable to their source. First-touch wins.
const attribution = captureAttribution();

// posthog-js (+ @posthog/react) is the single largest chunk in the app —
// bigger than React itself — so it's dynamically imported after the app has
// already started rendering instead of sitting on the initial critical path.
// Nothing breaks in the gap: every analytics call in lib/analytics.js queues
// until _setPostHogClient() hands it the real client below.
if (posthogToken) {
  import('posthog-js').then(({ default: posthog }) => {
    posthog.init(posthogToken, {
      api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
      // Required alongside a reverse-proxy api_host so PostHog's own links
      // (e.g. session replay URLs) still point back at the real dashboard.
      ui_host: 'https://us.posthog.com',
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
      // Never send the URL fragment to PostHog. /auth/callback receives Supabase's
      // implicit-flow session as `#access_token=…&refresh_token=…`, and $current_url
      // is window.location.href verbatim, so the fragment was landing in captured
      // events and session recordings. The access token expires in an hour; the
      // refresh token alongside it does not, and can be exchanged for new sessions
      // indefinitely using only the public anon key.
      //
      // posthog-js turns this on by default only from `defaults: '2026-06-25'`
      // onward, and we pin '2026-01-30' above, so it has to be set explicitly.
      // Bumping `defaults` instead would silently change unrelated behaviour.
      disable_capture_url_hashes: true,
      // disable_capture_url_hashes only drops the *fragment*. Since the move to
      // PKCE the callback carries its credential in the query instead —
      // `?code=…` for OAuth, `?token_hash=…` for email links — so those still
      // reach $current_url untouched. Both are single-use and short-lived, which
      // is why this is defence in depth rather than the fix, but there's no
      // reason to ship credentials to analytics at all. Scrub the URL-ish
      // properties on every event before it leaves the browser.
      before_send: (event) => {
        const props = event?.properties;
        if (props) {
          for (const key of ['$current_url', '$referrer', '$session_entry_url', '$pathname']) {
            if (typeof props[key] === 'string') props[key] = redactSensitiveUrl(props[key]);
          }
        }
        return event;
      },
      session_recording: {
        // Applies to captured network requests, not the replay's page URL
        // (posthog-recorder.js runs it over request/response headers). Inert
        // unless network capture is enabled — kept so that turning it on later
        // can't start recording the Supabase auth calls with their tokens.
        maskCapturedNetworkRequestFn: (request) => {
          if (request?.name) request.name = redactSensitiveUrl(request.name);
          return request;
        },
      },
    });
    if (Object.keys(attribution).length > 0) {
      posthog.register(attribution);
      posthog.setPersonProperties(undefined, attribution);
    }
    _setPostHogClient(posthog);
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
