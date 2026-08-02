import type { Preview } from '@storybook/react-native';
import { withBackgrounds } from '@storybook/addon-ondevice-backgrounds';

const preview: Preview = {
  decorators: [withBackgrounds],
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'light', value: '#F4F4F5' },
        { name: 'dark', value: '#0c0c0c' },
      ],
    },
  },
};

export default preview;
