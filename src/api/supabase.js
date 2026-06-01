import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const msg = 'VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. Check your .env file.';
  if (import.meta.env.DEV) throw new Error(msg);
  console.error(msg);
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
