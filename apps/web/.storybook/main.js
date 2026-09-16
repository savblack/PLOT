/** @type {import('@storybook/react-vite').StorybookConfig} */
export default {
  stories: ['../src/stories/**/*.stories.jsx'],
  framework: '@storybook/react-vite',
  addons: ['@storybook/addon-docs'],
  // Deliberately not extending apps/web/vite.config.js — it wires in the
  // Cloudflare Pages plugin for the deployed app, which Storybook doesn't
  // need and shouldn't depend on. The one thing borrowed from it is where the
  // env lives: the repo-root .env, so stories that talk to the TMDB proxy
  // (SearchPalette) find VITE_TMDB_PROXY_URL the way the app does.
  viteFinal: (config) => ({ ...config, envDir: '../..' }),
};
