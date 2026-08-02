/** @type {import('@storybook/react-vite').StorybookConfig} */
export default {
  stories: ['../src/stories/**/*.stories.jsx'],
  framework: '@storybook/react-vite',
  addons: ['@storybook/addon-docs'],
  // Deliberately not extending apps/web/vite.config.js — it wires in the
  // Cloudflare Pages plugin for the deployed app, which Storybook doesn't
  // need and shouldn't depend on.
};
