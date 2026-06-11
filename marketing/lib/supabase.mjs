// Service-role Supabase client for marketing scripts (CI / local only — never the browser).
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

export const getSupabase = () => {
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)');
  }
  return createClient(url, key, { auth: { persistSession: false } });
};

export const supabaseUrl = url;
