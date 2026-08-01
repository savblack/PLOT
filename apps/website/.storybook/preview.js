import '../theme.css';
import '../nav.css';
import './docs.css';

/** @type {import('@storybook/html-vite').Preview} */
export default {
  parameters: {
    layout: 'padded',
    backgrounds: {
      options: {
        light: { name: 'light', value: '#ffffff' },
        page: { name: 'page', value: '#f8f8f8' },
        dark: { name: 'dark', value: '#0c0c0c' },
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: 'light' },
  },
};
