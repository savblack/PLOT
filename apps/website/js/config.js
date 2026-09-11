/* Shared marketing-site script (theplot.tv) — loaded by index/privacy/terms.
   Single source of truth for Supabase constants, product analytics, and
   acquisition attribution. (SUS-95 / SUS-99 / SUS-115) */
window.PLOT = window.PLOT || {};

/* ── Product analytics — PostHog (SUS-99) ──────────────────────────────
   Same project as the app so the acquisition funnel (landing → CTA →
   signup) is one funnel. cross_subdomain_cookie shares the anonymous id
   across theplot.tv and app.theplot.tv. Kept as a direct hardcoded init
   (not routed through GTM) so it isn't dependent on googletagmanager.com
   loading — that domain is itself commonly ad-blocked, which would defeat
   the point of the a.theplot.tv reverse proxy. */
/* global posthog */
/* An exception the browser masked to "Script error." carries no message, no
   filename and no stack: it can only be closed, never diagnosed. Two of them
   reached the app's inbox on 2026-08-31 and cost a triage report to establish
   there was nothing to establish. Turning capture_exceptions on here without
   this guard would invite the same thing from every third-party tag on the
   marketing site. Mirrors isOpaqueBrowserException in
   apps/web/src/utils/opaqueException.js — an entry only qualifies when it is
   BOTH synthetic (the browser fabricated the Error) and has no stack frames,
   so a real throw is never dropped. Keep the two in agreement. */
function dropOpaqueException(event) {
  if (!event || event.event !== '$exception') return event;
  var list = event.properties && event.properties.$exception_list;
  if (!Array.isArray(list) || list.length === 0) return event;
  var opaque = list.every(function (entry) {
    if (!entry || typeof entry !== 'object') return false;
    if (!entry.mechanism || entry.mechanism.synthetic !== true) return false;
    var frames = entry.stacktrace && entry.stacktrace.frames;
    return !(frames && frames.length > 0);
  });
  return opaque ? null : event;
}

/* Host allowlist: one PostHog project serves everything, so without this a
   `wrangler pages dev` on localhost or a *.pages.dev preview reports straight
   into production. Mirrors apps/web/src/utils/analyticsHost.js — keep the two
   host lists in agreement. */
if (!window.PLOT_DNT && ['theplot.tv','www.theplot.tv','app.theplot.tv'].indexOf(location.hostname)>-1) {
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init('phc_uS3JEJC7s6T2WdsQToCZA3eRjLNakgc3EF3YPbza9Q6U', {
  api_host: 'https://a.theplot.tv',
  ui_host: 'https://us.posthog.com',
  person_profiles: 'identified_only',
  persistence: 'localStorage+cookie',
  cross_subdomain_cookie: true,
  capture_pageview: true,
  autocapture: true,
  /* Report unhandled errors and promise rejections to PostHog Error Tracking.
     The app has had this since it shipped; the marketing site did not, so a
     landing-page script that broke for real visitors produced no signal at all
     — and this is the top of the funnel. The host allowlist above is the dev
     gate, exactly as it is for pageviews, so localhost and *.pages.dev never
     reach the inbox. */
  capture_exceptions: true,
  before_send: dropOpaqueException,
});
}

/* ── Acquisition attribution (SUS-115) ─────────────────────────────────
   Forward UTM / click-id params and the original referrer from this visit
   onto the app signup & login links so attribution survives the hop to
   app.theplot.tv and into signup completion. */
(function () {
  function forwardAttribution() {
    var here = new URLSearchParams(window.location.search);
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid', 'ref', 'src'];
    var carry = new URLSearchParams();
    keys.forEach(function (k) { if (here.get(k)) carry.set(k, here.get(k)); });
    if (document.referrer) {
      try {
        var refHost = new URL(document.referrer).hostname;
        if (refHost && refHost !== window.location.hostname) carry.set('referrer', refHost);
      } catch { /* ignore malformed referrer */ }
    }
    if (!carry.toString()) return; // nothing to attribute
    document.querySelectorAll('a[href^="https://app.theplot.tv/"]').forEach(function (a) {
      try {
        var u = new URL(a.href);
        carry.forEach(function (v, k) { if (!u.searchParams.has(k)) u.searchParams.set(k, v); });
        a.href = u.toString();
      } catch { /* leave link untouched on parse error */ }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', forwardAttribution);
  } else {
    forwardAttribution();
  }
})();

/* ── CTA conversion events (SUS-99) ────────────────────────────────────
   Explicit, decision-useful events for the commercial CTAs so the
   visit → signup/login funnel reads cleanly (rather than leaning on
   generic autocapture labels). One delegated listener fires a named
   event with a `placement` property from each link's data-cta tag. */
(function () {
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('a[href*="app.theplot.tv/"]');
    if (!a) return;
    var path;
    try { path = new URL(a.href).pathname; } catch { return; }
    var action = path.indexOf('/signup') === 0 ? 'signup_cta_clicked'
               : path.indexOf('/login') === 0 ? 'login_click'
               : null;
    if (!action) return;
    posthog.capture(action, {
      placement: a.getAttribute('data-cta') || 'unknown',
      source: 'marketing',
    });
  }, true);
})();
