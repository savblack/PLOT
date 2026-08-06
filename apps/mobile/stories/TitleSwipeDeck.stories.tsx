import { useState } from 'react';
import { View, Text } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react-native';
import TitleSwipeDeck, { type DeckItem, type Direction } from '../components/TitleSwipeDeck';
import { ThemeProvider } from '../contexts/ThemeContext';

const TITLES = [
  { id: 1, title: 'The Last Reel', poster_path: null, release_date: '2024-03-01' },
  { id: 2, name: 'Late Signal', poster_path: null, first_air_date: '2023-11-14' },
  { id: 3, title: 'Harbor Light', poster_path: null, release_date: '2022-06-20' },
  { id: 4, name: 'Static City', poster_path: null, first_air_date: '2021-09-02' },
  { id: 5, title: 'Untitled Fallback' },
];

function Wrapper({ items }: { items: typeof TITLES }) {
  const [liked, setLiked] = useState<string[]>([]);
  const [passed, setPassed] = useState<string[]>([]);
  return (
    <View style={{ maxWidth: 340, alignSelf: 'center', width: '100%' }}>
      <TitleSwipeDeck
        items={items}
        onResolve={(item: DeckItem, direction: Direction) => {
          const label = item.title || item.name || '';
          if (direction === 'like') setLiked((prev) => [...prev, label]);
          else setPassed((prev) => [...prev, label]);
        }}
      />
      <Text style={{ marginTop: 24, fontSize: 12, color: '#888' }}>
        Liked: {liked.join(', ') || '—'}{'\n'}
        Passed: {passed.join(', ') || '—'}
      </Text>
    </View>
  );
}

const meta = {
  title: 'Components/TitleSwipeDeck',
  component: TitleSwipeDeck,
  // Every story below overrides rendering via `render`, ignoring these —
  // they exist only to satisfy Meta's required `args` (items/onResolve
  // aren't optional props).
  args: { items: TITLES, onResolve: () => {} },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <View style={{ padding: 16 }}>
          <Story />
        </View>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof TitleSwipeDeck>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Wrapper items={TITLES} />,
};

export const SingleCard: Story = {
  render: () => <Wrapper items={[TITLES[0]]} />,
};

export const DeckComplete: Story = {
  render: () => <Wrapper items={[]} />,
};
