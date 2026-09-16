import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { guidePreviewFeed } from '../../scripts/guide/dev-plugin.mjs'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  // Smoke tests bypass the Cloudflare plugin entirely and use Vite's own SPA
  // fallback. Everything else runs through Cloudflare's local asset handler,
  // whose SPA fallback comes from `assets.not_found_handling` in
  // apps/web/wrangler.toml — see the note there.
  plugins: [guidePreviewFeed(), react(), ...(process.env.PLOT_SMOKE_TEST ? [] : [cloudflare()])],
  // Local configuration is shared at the repository root. Without this Vite
  // only reads apps/web/.env, leaving the local app unable to initialise
  // Supabase when started through the documented root pnpm command.
  envDir: '../..',
  resolve: {
    // MANDATORY under pnpm. apps/mobile pins react 19.2.3 exactly (react-native
    // 0.86.3 requires that patch), so 19.2.3 takes the hoisted root slot and
    // every 19.3.0 consumer nests its own physical copy instead — apps/web,
    // packages/core, react-router, react-router-dom, posthog-js and
    // @posthog/react each ended up with one. Same version, different paths, so
    // Rollup treats them as distinct modules and the bundle ships several React
    // instances. The app then dies on `useContext` of null the moment a context
    // is read across the seam, which is exactly what the smoke tests caught.
    //
    // npm hid this by hoisting a single react for the whole workspace. Deduping
    // here restores that for the web bundle without forcing a react version on
    // mobile, where the exact pin is a hard react-native requirement.
    dedupe: ['react', 'react-dom', 'scheduler'],
  },
  server: {
    // Honor an externally assigned port (e.g. the Claude preview harness);
    // fall back to Vite's default when unset
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'vendor-react'
          }
          if (id.includes('/react-router/') || id.includes('/react-router-dom/')) {
            return 'vendor-router'
          }
          if (id.includes('/@supabase/')) {
            return 'vendor-supabase'
          }
          if (id.includes('/posthog-js/') || id.includes('/@posthog/')) {
            return 'vendor-posthog'
          }
          return 'vendor'
        },
      },
    },
  },
})
