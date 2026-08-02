/** @type {import('@storybook/react-vite').Preview} */
export default {
  parameters: {
    layout: 'padded',
    backgrounds: {
      options: {
        light: { name: 'light', value: '#F4F4F5' },
        dark: { name: 'dark', value: '#0c0c0c' },
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: 'dark' },
  },
};
