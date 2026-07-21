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
    // Vite preview ignores the Cloudflare SPA fallback in public/_redirects.
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
