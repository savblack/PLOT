// Now sourced from the shared @plot/core package.
// This re-export keeps `../lib/spelling` import sites working. Mobile
// previously kept its own copy whose word data matched web's but whose
// exported API had drifted (per-word helpers instead of web's key-based
// `regionalWords`). Both apps now read the same dictionary; use
// `regionalWords('color', region)` where mobile used to call `colorWords`.
export * from '@plot/core/spelling.js';
