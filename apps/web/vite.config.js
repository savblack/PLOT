import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  // Smoke tests need Vite's SPA fallback for client-side routes. Cloudflare's
  // local asset handler deliberately returns 404 for those routes instead.
  plugins: [react(), ...(process.env.PLOT_SMOKE_TEST ? [] : [cloudflare()])],
  // Local configuration is shared at the repository root. Without this Vite
  // only reads apps/web/.env, leaving the local app unable to initialise
  // Supabase when started through the documented root npm command.
  envDir: '../..',
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
