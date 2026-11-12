import { track } from './analytics.js';

const WEB_VITALS_EVENT = '$web_vitals';
const METRICS = ['CLS', 'FCP', 'INP', 'LCP'];
const HUMAN_WEB_VITALS_HOST = 'app.theplot.tv';
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'];

/**
 * Web Vitals are deliberately scoped to the product app. The marketing site
 * gets drive-by traffic, and PostHog's project-level automatic capture is off
 * because that traffic is mostly scrapers.
 */
export function isHumanWebVitalsHost(hostname = typeof window !== 'undefined' ? window.location.hostname : '') {
  return hostname === HUMAN_WEB_VITALS_HOST;
}

/**
 * Synthetic browser events are easy for crawlers and test runners to create.
 * Requiring a trusted event keeps this opt-in tied to an actual interaction.
 */
export function isTrustedHumanInteraction(event, visibilityState = typeof document !== 'undefined' ? document.visibilityState : '') {
  return Boolean(event?.isTrusted) && visibilityState === 'visible';
}

function serialiseMetric(metric) {
  const result = {};
  for (const key of ['id', 'name', 'value', 'delta', 'rating', 'navigationType', 'navigationId']) {
    if (metric?.[key] !== undefined) result[key] = metric[key];
  }
  return result;
}

/**
 * Keep the payload compatible with PostHog's native `$web_vitals` shape while
 * stripping the large PerformanceEntry objects returned by web-vitals.
 *
 * `pageUrl` is the page the browser actually loaded, not wherever the app is
 * when the event is sent. Both `$current_url` and `$pathname` are set from it,
 * because posthog-js would otherwise fill `$pathname` from the live location.
 */
export function buildWebVitalsProperties(metrics, pageUrl = '') {
  const properties = {
    $current_url: pageUrl,
    $web_vitals_enabled_server_side: false,
  };
  try {
    if (pageUrl) properties.$pathname = new URL(pageUrl).pathname;
  } catch {
    // An unparseable URL leaves $pathname to posthog-js.
  }

  for (const metric of metrics) {
    const serialised = serialiseMetric(metric);
    if (!serialised.name || serialised.value === undefined) continue;
    properties[`$web_vitals_${serialised.name}_value`] = serialised.value;
    properties[`$web_vitals_${serialised.name}_event`] = serialised;
  }

  return properties;
}

function safeCurrentUrl() {
  if (typeof window === 'undefined') return '';
  try {
    const url = new URL(window.location.href);
    // Keep route-level performance data, but never attach query strings or
    // fragments that may contain auth codes, tokens, or attribution values.
    return `${url.origin}${url.pathname}`;
  } catch {
    return '';
  }
}

/**
 * Start one page-load Web Vitals observer after a trusted interaction on the
 * production app. The dynamic import keeps the measurement library out of the
 * initial bundle, and the five-second flush mirrors PostHog's native batching.
 *
 * Every metric here describes the document load: web-vitals does not measure
 * in-app (client-side) navigations. So readings are filed under the URL the
 * page loaded on, captured here at startup. Before 2026-11-12 they used the URL
 * at send time, and LCP is only sent on the next click, which is often a click
 * that navigates. A slow /signup load was reported as /onboarding, and a /home
 * load sent half an hour later showed up as /my-lists or /settings (#1596).
 */
export function startHumanWebVitalsCapture({ capture = track } = {}) {
  if (typeof window === 'undefined' || !isHumanWebVitalsHost()) return () => {};

  const pageUrl = safeCurrentUrl();

  let started = false;
  let disposed = false;
  let flushTimer;

  const removeListeners = () => {
    for (const eventName of INTERACTION_EVENTS) {
      window.removeEventListener(eventName, onInteraction, true);
    }
  };

  const onInteraction = (event) => {
    if (started || disposed || !isTrustedHumanInteraction(event)) return;
    started = true;
    removeListeners();

    import('web-vitals').then(({ onCLS, onFCP, onINP, onLCP }) => {
      if (disposed) return;

      const metrics = new Map();
      const flush = () => {
        if (metrics.size === 0 || disposed) return;
        if (flushTimer) window.clearTimeout(flushTimer);
        flushTimer = undefined;
        capture(WEB_VITALS_EVENT, buildWebVitalsProperties(metrics.values(), pageUrl));
        metrics.clear();
      };
      const addMetric = (metric) => {
        if (!metric?.name || !METRICS.includes(metric.name)) return;
        metrics.set(metric.name, metric);
        if (!flushTimer) flushTimer = window.setTimeout(flush, 5000);
        if (metrics.size === METRICS.length) flush();
      };

      onCLS(addMetric);
      onFCP(addMetric);
      onINP(addMetric);
      onLCP(addMetric);
    }).catch(() => {
      // Analytics must never surface a measurement-library failure to users.
    });
  };

  for (const eventName of INTERACTION_EVENTS) {
    window.addEventListener(eventName, onInteraction, { capture: true, passive: true });
  }

  return () => {
    disposed = true;
    removeListeners();
    if (flushTimer) window.clearTimeout(flushTimer);
  };
}
