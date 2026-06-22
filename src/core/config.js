// Platform-agnostic runtime config for the shared core.
//
// The core layer (api/, domain/, data hooks, utils) must never read
// `import.meta.env` (web/Vite) or `process.env` (mobile/Expo) directly — those
// are platform-specific and are the single biggest source of web↔mobile drift.
// Instead, each app calls `configure()` exactly once at startup with values
// pulled from its own environment, and core modules read them via `getConfig()`.
//
//   web    (src/main.jsx):      configure({ supabaseUrl: import.meta.env.VITE_SUPABASE_URL, ... })
//   mobile (app root layout):   configure({ supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL, ... })
//
// This file is intended to be shared byte-identically between both repos.

const defaults = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  tmdbProxyUrl: '',
  traktClientId: '',
  isDev: false,
  // Optional createClient() options. Web leaves this undefined (default
  // localStorage session). Mobile injects { auth: { storage: AsyncStorage, … } }
  // so Supabase persists the session via AsyncStorage. This is the storage seam.
  supabaseClientOptions: undefined,
};

let config = { ...defaults };

/**
 * Merge platform config into the shared store. Call once at app startup,
 * before any core module makes a network/auth call.
 * @param {Partial<typeof defaults>} next
 * @returns {typeof defaults} the resolved config
 */
export function configure(next = {}) {
  config = { ...config, ...next };
  return config;
}

/** Read the current resolved config. */
export function getConfig() {
  return config;
}
