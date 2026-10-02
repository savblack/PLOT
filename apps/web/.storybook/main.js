import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Watch together (and the collaborative lists built on it) is gated by
// SHOW_WATCH_TOGETHER, which is on only for localhost and Cloudflare preview
// hosts unless VITE_SHOW_WATCH_TOGETHER says otherwise. Chromatic serves
// stories from *.chromatic.com, so without this the gated UI vanished there
// and every story exercising it failed, while the same stories passed
// locally. Storybook documents the feature, so switch it on for every build.
// Vite reads VITE_* values from process.env ahead of .env files.
process.env.VITE_SHOW_WATCH_TOGETHER ??= 'true';

/** @type {import('@storybook/react-vite').StorybookConfig} */
export default {
  stories: ['../src/stories/**/*.stories.jsx'],
  framework: '@storybook/react-vite',
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
  ],
  // Deliberately not extending apps/web/vite.config.js — it wires in the
  // Cloudflare Pages plugin for the deployed app, which Storybook doesn't
  // need and shouldn't depend on. The one thing borrowed from it is where the
  // env lives: the repo-root .env, so stories that talk to the TMDB proxy
  // (SearchPalette) find VITE_TMDB_PROXY_URL the way the app does.
  viteFinal: (config) => ({
    ...config,
    envDir: '../..',
    resolve: {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        react: path.join(dirname, '../node_modules/react'),
        'react-dom': path.join(dirname, '../node_modules/react-dom'),
      },
      dedupe: [...(config.resolve?.dedupe || []), 'react', 'react-dom'],
    },
  }),
};
