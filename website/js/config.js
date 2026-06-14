/* Shared Supabase / proxy constants for the marketing site (SUS-95).
   Single source of truth referenced by index.html, privacy.html and terms.html
   so the project URL and anon key are not duplicated across pages.
   The anon key is a public, RLS-gated token — safe to ship client-side. */
window.PLOT = window.PLOT || {};
window.PLOT.SUPABASE_FN = 'https://mkegtssedjyqldysvzga.supabase.co/functions/v1';
window.PLOT.SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rZWd0c3NlZGp5cWxkeXN2emdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDgzMzUsImV4cCI6MjA4OTE4NDMzNX0.W-toEr3ftNeN0iTpRQ8Ord09sxBiwO2CQC6j2jszN6w';
