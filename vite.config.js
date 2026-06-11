import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Honor an externally assigned port (e.g. the Claude preview harness);
    // fall back to Vite's default when unset
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
  build: {
    sourcemap: false,
  },
})
