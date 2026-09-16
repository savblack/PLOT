import { defineConfig, devices } from '@playwright/test';

const smokePort = Number(process.env.PLOT_SMOKE_PORT || 4273);
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;

export default defineConfig({
  testDir: './tests/smoke',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: smokeBaseUrl,
    trace: 'on-first-retry',
  },
  webServer: {
    // Smoke fixtures must never reach production, including CI with real secrets.
    env: {
      VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'placeholder-not-a-key',
      VITE_TMDB_PROXY_URL: 'https://placeholder.invalid',
      VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: '',
    },
    // Vite preview ignores the Cloudflare SPA fallback (see assets.
    // not_found_handling in wrangler.toml), so deep links 404 under it.
    // Use Vite's SPA server after first checking the production build.
    command: `PLOT_SMOKE_TEST=1 npm run dev -- --host 127.0.0.1 --port ${smokePort} --strictPort`,
    url: smokeBaseUrl,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
