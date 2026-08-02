/* ── TMDB image helpers ──────────────── */
export const posterUrl   = (path, size = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
export const backdropUrl = (path, size = 'w780') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
export const logoUrl     = (path, size = 'w45')  =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
export const profileUrl  = (path, size = 'w185') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
