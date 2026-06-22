import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client = null;

function getClient() {
  if (client) return client;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase URL or anon key is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.',
    );
  }
  client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
}

// Lazy proxy: existing `supabase.auth` / `supabase.from(...)` call sites keep
// working unchanged, but the client is created — and env validated — on first
// access rather than at import time. A missing-config error then throws during
// React render/effect, where the route error boundary can catch it and show a
// branded screen, instead of killing app bootstrap with a blank page.
export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const c = getClient();
      const value = c[prop];
      return typeof value === 'function' ? value.bind(c) : value;
    },
  },
);
