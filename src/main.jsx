import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import router from './router.jsx';
import './index.css';
import posthog from 'posthog-js';
import { PostHogProvider } from '@posthog/react';
import { Analytics } from '@vercel/analytics/react';

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: '2026-01-30',
  // Share the anonymous id across theplot.tv ↔ app.theplot.tv so the
  // landing → signup funnel is one funnel. Must match website/js/config.js.
  persistence: 'localStorage+cookie',
  cross_subdomain_cookie: true,
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PostHogProvider client={posthog}>
      <RouterProvider router={router} />
      <Analytics />
    </PostHogProvider>
  </StrictMode>,
);
