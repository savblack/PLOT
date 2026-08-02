import '../src/styles/tokens.css';
import '../src/styles/app.css';

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
    backgrounds: { value: 'light' },
  },
  decorators: [
    (Story, context) => {
      document.documentElement.setAttribute(
        'data-theme',
        context.globals.backgrounds?.value === '#0c0c0c' ? 'dark' : 'light'
      );
      return Story();
    },
  ],
};
