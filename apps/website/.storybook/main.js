/** @type {import('@storybook/html-vite').StorybookConfig} */
export default {
  stories: ['../stories/**/*.stories.js'],
  framework: '@storybook/html-vite',
  addons: ['@storybook/addon-docs'],
  staticDirs: ['../images'],
};
