import { createClient } from '@supabase/supabase-js';
import { getConfig } from './config.js';

let client = null;

function getClient() {
  if (client) return client;
  const { supabaseUrl, supabaseAnonKey, isDev, supabaseClientOptions } = getConfig();
  if (!supabaseUrl || !supabaseAnonKey) {
    const msg = 'Supabase URL or anon key is missing. Ensure configure() ran at startup with valid env values.';
    if (isDev) throw new Error(msg);
    console.error(msg);
  }
  // supabaseClientOptions is undefined on web (default session storage) and the
  // AsyncStorage auth config on mobile — see core/config.js.
  client = createClient(supabaseUrl || '', supabaseAnonKey || '', supabaseClientOptions);
  return client;
}

// Lazy proxy: keeps every `import { supabase }` call site unchanged while
// deferring client creation until *after* configure() has run at startup
// (ESM evaluates this module before main.jsx's body, so eager creation would
// read empty config). Methods are bound to the real client; property reads
// pass through to it.
export const supabase = new Proxy({}, {
  get(_target, prop) {
    const c = getClient();
    const value = c[prop];
    return typeof value === 'function' ? value.bind(c) : value;
  },
});
