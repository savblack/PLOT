// A browser-viewable mirror of the on-device Storybook in ../.storybook —
// same stories, rendered through react-native-web instead of Metro/RN. Kept
// deliberately separate from the app's own metro/babel config, same reason
// apps/web's .storybook/main.js doesn't extend apps/web/vite.config.js.
/** @type {import('@storybook/react-vite').StorybookConfig} */
export default {
  stories: ['../stories/**/*.stories.?(ts|tsx|js|jsx)'],
  framework: '@storybook/react-vite',
  addons: ['@storybook/addon-docs'],
  viteFinal: async (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...config.resolve.alias,
      'react-native': 'react-native-web',
    };
    // apps/mobile pins its own react/react-dom (nested locally since they
    // differ from the root-hoisted versions apps/web uses); without this,
    // Storybook's own hoisted framework package resolves a second, mismatched
    // React copy and rendering fails with "invalid hook call" style errors.
    config.resolve.dedupe = [
      ...(config.resolve.dedupe ?? []),
      'react',
      'react-dom',
    ];
    config.resolve.extensions = [
      '.web.tsx', '.web.ts', '.web.jsx', '.web.js',
      ...(config.resolve.extensions ?? ['.tsx', '.ts', '.jsx', '.js', '.json']),
    ];
    config.define = {
      ...config.define,
      // Some react-native-web internals check this Node-only global.
      global: 'globalThis',
    };
    return config;
  },
};
