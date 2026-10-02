import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Watch together and collaborative lists sit behind SHOW_WATCH_TOGETHER, which
// is on only for localhost and *.pages.dev preview hosts unless this env var
// forces it. Chromatic serves the Storybook from *.chromatic.com, so without
// this every collaborative-list story rendered with the feature off there
// (no Invite, no shared summary, no people button) and their play functions
// failed, while the same stories passed on localhost. Storybook documents the
// feature as built, so force it on here; an explicit value still wins.
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
