/**
 * Kill switches: turn a shipped feature OFF without shipping a new version.
 *
 * Each switch is a PostHog feature flag named `kill-<feature>`. While the flag
 * is enabled the feature is hidden; while it is disabled, missing, or PostHog
 * cannot be reached, the feature follows the app's own launch setting. A switch
 * can only take a feature away. It never turns on something the build left off.
 *
 * Why PostHog flags, read this way:
 *  - Flipping a flag in PostHog takes seconds and needs no deploy, so a person
 *    or the fix agent can stop a broken feature while the real fix is written.
 *  - The read goes to the `/flags` endpoint through Plot's own proxy host with
 *    one fixed id (SWITCH_READER_ID), not the visitor's. Nothing about the
 *    person is sent, so it also runs for people who opted out of analytics,
 *    and does not wait for posthog-js (which loads late, on purpose).
 *  - Fail open: a network error, a blocked request or an odd response changes
 *    nothing. A switch failing must never be what breaks a feature.
 *
 * Platform-agnostic: the app passes in fetch, the host and the token, and
 * keeps the last answer in its own storage (localStorage on web).
 */

/** Feature name (as the apps use it) -> PostHog flag key. */
export const KILL_SWITCHES = Object.freeze({
  watchTogether: 'kill-watch-together',
  pricingPage: 'kill-pricing-page',
  appleLogin: 'kill-apple-login',
  googleLogin: 'kill-google-login',
});

/** The fixed id every switch read uses. Flags must target everyone, not people. */
export const SWITCH_READER_ID = 'plot-kill-switches';

/** Storage key for the last answer, read synchronously at startup on web. */
export const KILL_SWITCH_STORAGE_KEY = 'plot_kill_switches';

const FLAG_TO_NAME = new Map(Object.entries(KILL_SWITCHES).map(([name, flag]) => [flag, name]));

/**
 * The feature names whose kill flag is on, from a `/flags?v=2` response (or
 * the older `/decide`-style `featureFlags` map). Anything unrecognised is
 * ignored. Returns null when the response is not a usable answer, so the
 * caller keeps what it had instead of treating "no answer" as "all on".
 *
 * @param {any} body
 * @returns {string[] | null}
 */
export function killedFromFlags(body) {
  if (!body || typeof body !== 'object' || body.errorsWhileComputingFlags === true) return null;
  /** @type {Record<string, unknown>} */
  let enabled = {};
  if (body.flags && typeof body.flags === 'object') {
    for (const [key, f] of Object.entries(body.flags)) enabled[key] = !!(f && typeof f === 'object' && /** @type {any} */ (f).enabled);
  } else if (body.featureFlags && typeof body.featureFlags === 'object') {
    enabled = body.featureFlags;
  } else {
    return null;
  }
  const out = [];
  for (const [flag, name] of FLAG_TO_NAME) if (enabled[flag] === true) out.push(name);
  return out.sort();
}

/**
 * Ask PostHog which kill switches are on. Never throws.
 *
 * @param {{ http: typeof fetch, host: string, token: string, timeoutMs?: number }} opts
 * @returns {Promise<string[] | null>} killed feature names, or null if unknown
 */
export async function fetchKilledSwitches({ http, host, token, timeoutMs = 5000 }) {
  if (!http || !host || !token) return null;
  try {
    const res = await http(`${host.replace(/\/+$/, '')}/flags/?v=2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: token, distinct_id: SWITCH_READER_ID }),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    if (!res.ok) return null;
    return killedFromFlags(await res.json());
  } catch {
    return null;
  }
}

/**
 * Parse the stored answer. Unknown names are dropped, so a switch removed from
 * KILL_SWITCHES can never stay stuck off on someone's device.
 *
 * @param {string | null | undefined} raw
 * @returns {string[]}
 */
export function parseStoredKilled(raw) {
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.filter((n) => typeof n === 'string' && n in KILL_SWITCHES).sort() : [];
  } catch {
    return [];
  }
}

/**
 * Whether a feature is on: its launch setting, unless its switch is killed.
 *
 * @param {keyof typeof KILL_SWITCHES} name
 * @param {boolean} launchDefault
 * @param {readonly string[]} killed
 */
export function featureOn(name, launchDefault, killed) {
  return !!launchDefault && !killed.includes(name);
}

/**
 * Of the features that are on right now, which would a fresh answer turn off?
 * Only those matter for an open session: lifting a switch can wait for the
 * next load, but a feature being stopped should leave soon.
 *
 * @param {readonly string[]} current killed at startup
 * @param {readonly string[]} fresh   killed now
 * @param {Record<string, boolean>} launchDefaults feature name -> launch setting
 */
export function newlyKilled(current, fresh, launchDefaults) {
  return fresh.filter((n) => !current.includes(n) && launchDefaults[n]);
}
