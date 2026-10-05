import { View } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react-native';
import { activityCard } from '@plot/core/shareCards.js';
import ShareCardView, { type ShareCardModel } from '../components/share/ShareCardView';

// The Activity card on made-up history: a watch on every third day of the year
// so far, a busy last day, so the grid, the best day and the placeholders for
// days outside the range all show.
const NOW = new Date(2026, 8, 16);
const entries = Array.from({ length: 82 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 0, 3 + i * 3));
  return { watched_at: d.toISOString().slice(0, 10) };
});
entries.push({ watched_at: '2026-09-16' }, { watched_at: '2026-09-16' });
const card = { ...activityCard({ entries, now: NOW }), available: true } as unknown as ShareCardModel;

const meta = {
  title: 'Components/ShareCardView',
  component: ShareCardView,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: 'flex-start' }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof ShareCardView>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The year to date, M T W T F S S, equal squares. */
export const ActivityPost: Story = { args: { card, format: 'post', width: 600 } };

/** The last quarter. */
export const ActivityStory: Story = { args: { card, format: 'story', width: 300 } };
