/** @type {import('@storybook/react-vite').StorybookConfig} */
export default {
  stories: ['../src/stories/**/*.stories.jsx'],
  framework: '@storybook/react-vite',
  addons: ['@storybook/addon-docs'],
  // Deliberately not extending apps/web/vite.config.js — it wires in the
  // Cloudflare Pages plugin for the deployed app, which Storybook doesn't
  // need and shouldn't depend on. The one setting it does share is where
  // `.env` lives (the repo root), so stories that read TMDB through the
  // proxy find VITE_TMDB_PROXY_URL the same way the app does.
  viteFinal: (config) => ({ ...config, envDir: '../..' }),
};
