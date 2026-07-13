// @plot/core is consumed via explicit subpath imports, e.g.
//   import { getConfig } from '@plot/core/config.js'
//   import { useWatchlist } from '@plot/core/useWatchlist.js'
// This barrel intentionally stays empty so a bare `@plot/core` import does not
// pull in modules with side effects (e.g. the Supabase client). Import the
// specific module you need instead.
export {}
