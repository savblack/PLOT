import { View } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react-native';
import PlotLoader from '@plot/ui/PlotLoader';

const meta = {
  title: 'Components/PlotLoader',
  component: PlotLoader,
  decorators: [
    (Story) => (
      <View style={{ height: 200 }}>
        <Story />
      </View>
    ),
  ],
  args: {
    backgroundColor: '#0c0c0c',
    color: '#f0efe8',
  },
} satisfies Meta<typeof PlotLoader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OnLight: Story = {
  args: {
    backgroundColor: '#F4F4F5',
    color: '#0c0c0c',
  },
};
