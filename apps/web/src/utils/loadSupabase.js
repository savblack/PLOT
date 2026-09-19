// Auth screens can render before the Supabase SDK has downloaded. Start the
// import as soon as this lightweight module evaluates, then share the same
// promise between the session check and any form action.
const supabasePromise = import('@plot/core/supabase.js').then(({ supabase }) => supabase);

export function loadSupabase() {
  return supabasePromise;
}
