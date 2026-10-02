import '../src/styles/tokens.css';
import '../src/styles/base.css';
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
    // Chromatic freezes CSS animations on their first frame by default. Every
    // dialog and sheet here fades in from opacity 0, so snapshots caught them
    // see-through, with whatever the page underneath had rendered by then
    // showing through: a diff on every run. Capture the settled frame instead.
    chromatic: { pauseAnimationAtEnd: true },
  },
  initialGlobals: {
    backgrounds: { value: 'light' },
  },
  decorators: [
    (Story, context) => {
      // Stories pick dark with the backgrounds global. Its value is the option
      // KEY ('dark'); older stories passed the hex, which the backgrounds addon
      // does not recognise, so it left the canvas light while this decorator
      // still switched the app to dark. Accept both so either form gives a
      // dark theme on a dark canvas.
      const value = context.globals.backgrounds?.value;
      document.documentElement.setAttribute('data-theme', value === 'dark' || value === '#0c0c0c' ? 'dark' : 'light');
      return Story();
    },
  ],
};
