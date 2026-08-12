import { createClient } from '@supabase/supabase-js';
import { getConfig } from './config.js';

let client = null;
// The inputs `client` was built from. Deliberately only the four that decide
// *which* client this is — not the whole config object. Keying on config
// identity would mean any later configure() call (to set an analytics seam,
// say) silently rebuilt the client and dropped the user's auth session. Keying
// on these means a swap happens exactly when the client should actually differ,
// which is what lets a test inject an adapter and the next test replace it.
let clientKey = null;

function sameClientKey(cfg) {
  return clientKey
    && clientKey.injected === cfg.supabaseClient
    && clientKey.url === cfg.supabaseUrl
    && clientKey.anonKey === cfg.supabaseAnonKey
    && clientKey.options === cfg.supabaseClientOptions;
}

function rememberClientKey(cfg) {
  clientKey = {
    injected: cfg.supabaseClient,
    url:      cfg.supabaseUrl,
    anonKey:  cfg.supabaseAnonKey,
    options:  cfg.supabaseClientOptions,
  };
}

function getClient() {
  const cfg = getConfig();
  if (client && sameClientKey(cfg)) return client;

  // An injected client is the seam: apps never set this, so they get a real
  // createClient below. Tests pass an in-memory adapter and drive the same
  // hooks and data functions the apps do, through the same interface.
  if (cfg.supabaseClient) {
    client = cfg.supabaseClient;
    rememberClientKey(cfg);
    return client;
  }

  const { supabaseUrl, supabaseAnonKey, supabaseClientOptions } = cfg;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Throw (rather than warn) so the missing-config error surfaces during
    // React render/effect where the route error boundary can show a branded
    // screen, instead of silently constructing a broken client. (Matches the
    // web app's PR #189 behaviour.)
    throw new Error(
      'Supabase URL or anon key is missing. Ensure configure() ran at startup with valid env values.',
    );
  }
  // supabaseClientOptions is undefined on web (default session storage) and the
  // AsyncStorage auth config on mobile — see core/config.js.
  client = createClient(supabaseUrl, supabaseAnonKey, supabaseClientOptions);
  rememberClientKey(cfg);
  return client;
}

// Lazy proxy: keeps every `import { supabase }` call site unchanged while
// deferring client creation until *after* configure() has run at startup
// (ESM evaluates this module before main.jsx's body, so eager creation would
// read empty config). Methods are bound to the real client; property reads
// pass through to it. The JSDoc cast gives TS consumers (mobile) the real
// SupabaseClient type instead of the bare Proxy target `{}`.
/** @type {import('@supabase/supabase-js').SupabaseClient} */
export const supabase = /** @type {any} */ (new Proxy({}, {
  get(_target, prop) {
    const c = getClient();
    const value = c[prop];
    return typeof value === 'function' ? value.bind(c) : value;
  },
}));
